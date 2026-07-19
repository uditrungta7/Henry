import { readFileSync } from "node:fs";

// App version, read from package.json at build time and inlined into the static
// renderer so the lock screen can show it (no runtime IPC needed).
const appVersion = JSON.parse(readFileSync("./package.json", "utf8")).version;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  // Desktop app: export a fully static renderer that Electron loads over file://.
  // No Next.js server runs in the packaged app — all data/auth/email goes through
  // the Electron main process via IPC. This forbids server actions, API routes,
  // and server-side data fetching, which we've moved to IPC.
  output: "export",
  // Absolute asset paths (served from out/ root by the app:// handler) so assets
  // resolve the same from any route — deep links and reloads on nested routes work.
  assetPrefix: "/",
  // No image optimization server in a static export.
  images: { unoptimized: true },
  // Folder-style routes (/customers/index.html) so navigation resolves.
  trailingSlash: true,
};

export default nextConfig;
