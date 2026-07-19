// Electron main process. Owns the window, the SQLite database, SMTP + the
// license check. The renderer is the existing React UI, exported statically by
// Next and loaded here; it reaches the main process only through the typed
// bridge in preload.ts.

import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, protocol, session, dialog } from "electron";
import { openDatabase, closeDatabase } from "./db";
import { registerIpcHandlers } from "./ipc";
import { ensureLicenseId, checkLicenseIfDue } from "./license";

const isDev = process.env.ELECTRON_DEV === "1";

// Force US English so native controls (the date pickers on the time-off sheet
// and anywhere else) always show MM/DD/YYYY, no matter the computer's locale.
app.commandLine.appendSwitch("lang", "en-US");

// Last-resort handlers: a stray throw/rejection in the main process must never
// leave the app in a silent, half-dead state. Log, and (once ready) tell the
// user plainly instead of vanishing.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process:", err);
  if (app.isReady()) {
    dialog.showErrorBox(
      "Henry hit a problem",
      "Something went wrong. Please restart Henry. If it keeps happening, contact support.\n\n" +
        String(err instanceof Error ? err.message : err)
    );
  }
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection in main process:", reason);
});

// In production the renderer is the static Next export in ./out, served over a
// custom app:// scheme so client-side routes and relative assets resolve cleanly
// (plain file:// mishandles History-API navigation). In dev we point at the Next
// dev server for hot reload.
const RENDERER_OUT = path.join(__dirname, "..", "out");

// Content-Security-Policy for the packaged renderer. All data flows through IPC
// (window.henry), never the network, so the renderer never needs to reach a
// remote host — connect/img/font are pinned to self. 'unsafe-inline' is required
// for scripts/styles because Next's static export emits inline bootstrap script
// and styled-jsx/Tailwind inline styles (a static export can't use nonces).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

// Register the privileged app:// scheme before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Resolve a request path to a file inside RENDERER_OUT, or null if it would
// escape that directory. Encoded dot-segments (%2e%2e / %2f) survive URL parsing
// and only turn into ".."/"/" after decodeURIComponent, so we must re-check
// containment on the decoded, joined path — not trust the URL normalizer.
function resolveStaticFile(urlPath: string): string | null {
  // Strip query/hash, default to index, and map directory paths to their
  // index.html (trailingSlash export emits /customers/index.html).
  let p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  if (p === "" || p === "/") p = "/index.html";
  let filePath = path.normalize(path.join(RENDERER_OUT, p));
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }
  // Containment guard: the resolved path must be RENDERER_OUT itself or below it.
  if (filePath !== RENDERER_OUT && !filePath.startsWith(RENDERER_OUT + path.sep)) {
    return null;
  }
  return filePath;
}

// Content types for the static renderer's assets. An EXPLICIT type is essential:
// without it, nested-route HTML was served without "text/html" and the packaged
// app rendered the page as raw text.
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// Read a renderer file and return it with an explicit content type. Reads via fs
// (which IS asar-aware) rather than net.fetch("file://…"), which does not reliably
// read from inside the packaged app.asar and drops the content type — the cause of
// nested routes rendering as raw text.
function serveFile(filePath: string): Response {
  try {
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return new Response(fs.readFileSync(filePath), { headers: { "Content-Type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function registerAppProtocol(): void {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const filePath = resolveStaticFile(url.pathname);
    // Path escaped the renderer directory (traversal attempt) -> refuse.
    if (filePath === null) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!fs.existsSync(filePath)) {
      // Missing asset (has an extension): return 404 so failures are visible,
      // not masked as HTML. Missing navigation route: fall back to the SPA entry.
      if (path.extname(url.pathname)) {
        return new Response("Not found", { status: 404 });
      }
      return serveFile(path.join(RENDERER_OUT, "index.html"));
    }
    return serveFile(filePath);
  });
}

// Refuse any navigation or popup that would take the window off the app's own
// origin (app:// in prod, the dev server in dev). Defense-in-depth: even if a
// malicious link reached the page, it can't point the app at remote content.
function hardenNavigation(win: BrowserWindow): void {
  const allowed = (target: string) =>
    isDev ? target.startsWith("http://localhost:3000") : target.startsWith("app://");

  win.webContents.on("will-navigate", (e, target) => {
    if (!allowed(target)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#ffffff",
    title: "Henry",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require() for the bridge; renderer stays isolated
      webSecurity: true,
      // No DevTools in the shipped app: it would let anyone at a shared computer
      // open the console on the password lock screen and call window.henry.*
      // directly, sidestepping the lock. Disabling it makes both the menu item
      // and the keyboard shortcut inert (the app menu — hence copy/paste/Quit —
      // is left intact). DevTools stays on in dev.
      devTools: isDev,
    },
  });

  hardenNavigation(win);

  if (isDev) {
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL("app://local/index.html");
  }
}

app.whenReady().then(() => {
  // Open + migrate the database first, so IPC handlers always have a live DB. A
  // failure here (corrupt file, disk full, locked WAL, bad permissions) is fatal
  // and must be shown, not swallowed into a blank window.
  try {
    openDatabase();
  } catch (err) {
    dialog.showErrorBox(
      "Henry can't open its data",
      "Henry couldn't open its local database, so it can't start.\n\n" +
        "This usually means the disk is full or the data folder isn't writable. " +
        "Free up space or check permissions, then try again.\n\n" +
        String(err instanceof Error ? err.message : err)
    );
    app.quit();
    return;
  }

  registerIpcHandlers();

  if (!isDev) {
    // Attach the app's CSP to every response in production. (Dev is skipped so
    // Next's HMR websocket keeps working.)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
        },
      });
    });
    registerAppProtocol();
  }

  // License: ensure a stable per-machine id, then check the endpoint (≤ once/day).
  // No endpoint configured -> stays unlocked. Network errors are swallowed (the
  // renderer's gate uses the cached result + offline grace). Fire-and-forget so
  // the window opens immediately; the gate reads cached state.
  ensureLicenseId();
  void checkLicenseIfDue();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  closeDatabase();
});
