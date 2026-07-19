// Registers IPC handlers in the MAIN process. Each handler runs the DB query
// layer (or publish/drafts/email logic) and returns plain JSON to the renderer.
// The renderer calls these only through the typed bridge in preload.ts.

import path from "node:path";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { getDatabase } from "./db";
import * as q from "./db/queries";
import { publishWeek, resendEmail } from "./publish";
import { hasUnsentChanges, unsentDates, revertUnsentChanges } from "./drafts";
import {
  saveEmailConfig,
  saveEmailPassword,
  getEmailConfig,
  sendTestEmail,
  type SmtpConfigInput,
} from "./email/settings";
import { getGateState, tryUnlock, markUnlocked, lock } from "./gate";
import { hasAppPassword, setAppPassword, verifyAppPassword } from "./auth";
import { checkLicenseIfDue, getLicenseStatus } from "./license";

export function registerIpcHandlers(): void {
  // --- sanity / settings ---
  ipcMain.handle("app:ping", (_e, msg: string) => ({
    ok: true,
    echo: msg,
    at: new Date().toISOString(),
  }));

  // The renderer may only touch a small allowlist of settings. Everything else
  // (license_valid, is_licensed, trial_ends_at, license_endpoint, license_id, the
  // SMTP config keys) is privileged and must not be readable/writable from the UI,
  // so a compromised renderer — or anyone poking at devtools — can't flip the
  // license gate or corrupt state. Dedicated handlers cover the legitimate cases
  // (company:get, email:*, gate:*, timeoff:*).
  const RENDERER_SETTINGS = new Set(["company_name", "password_prompt_seen"]);

  ipcMain.handle("settings:get", (_e, key: string): string | null => {
    if (!RENDERER_SETTINGS.has(key)) return null;
    const row = getDatabase()
      .prepare("select value from settings where key = ?")
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  });

  ipcMain.handle("settings:set", (_e, key: string, value: string): void => {
    if (!RENDERER_SETTINGS.has(key)) {
      throw new Error(`Setting "${key}" can't be changed from here.`);
    }
    getDatabase()
      .prepare(
        "insert into settings (key, value) values (?, ?) " +
          "on conflict(key) do update set value = excluded.value"
      )
      .run(key, String(value));

    // When the owner names their company during setup, push it to the license
    // server right away instead of waiting for the next daily check — otherwise
    // the row keeps the blank name it registered with on first launch.
    if (key === "company_name" && String(value).trim()) {
      void checkLicenseIfDue(true);
    }
  });

  // --- company ---
  ipcMain.handle("company:get", () => q.getCompany());

  // --- customers ---
  ipcMain.handle("customers:list", () => q.listCustomers());
  ipcMain.handle("customers:save", (_e, id: string | null, input: q.CustomerInput) =>
    q.saveCustomer(id, input)
  );
  ipcMain.handle("customers:setActive", (_e, id: string, isActive: boolean) =>
    q.setCustomerActive(id, isActive)
  );
  ipcMain.handle("customers:setPinned", (_e, id: string, pinned: boolean) =>
    q.setCustomerPinned(id, pinned)
  );

  // --- employees + time off ---
  ipcMain.handle("employees:list", () => q.listEmployees());
  ipcMain.handle("employees:save", (_e, id: string | null, input: q.EmployeeInput) =>
    q.saveEmployee(id, input)
  );
  ipcMain.handle("employees:setActive", (_e, id: string, isActive: boolean) =>
    q.setEmployeeActive(id, isActive)
  );
  ipcMain.handle(
    "timeoff:add",
    (_e, employeeId: string, start: string, end: string, reason: string | null) =>
      q.addTimeOff(employeeId, start, end, reason)
  );
  ipcMain.handle("timeoff:remove", (_e, id: string) => q.removeTimeOff(id));
  ipcMain.handle("timeoff:getReasons", () => q.getTimeOffReasons());
  ipcMain.handle("timeoff:setReasons", (_e, reasons: string[]) =>
    q.setTimeOffReasons(reasons)
  );

  // --- schedule board ---
  ipcMain.handle("board:get", (_e, first: string, last: string) =>
    q.getBoardData(first, last)
  );
  ipcMain.handle(
    "assignments:assign",
    (_e, customerId: string, employeeId: string, workDate: string, shift: "AM" | "PM") =>
      q.assign(customerId, employeeId, workDate, shift)
  );
  ipcMain.handle("assignments:unassign", (_e, id: string) => q.unassign(id));
  ipcMain.handle(
    "assignments:move",
    (
      _e,
      assignmentId: string,
      targetCustomerId: string,
      targetShift: "AM" | "PM",
      targetAssignmentId: string | null
    ) => q.move(assignmentId, targetCustomerId, targetShift, targetAssignmentId)
  );
  ipcMain.handle("assignments:setNotes", (_e, id: string, notes: string | null) =>
    q.setNotes(id, notes)
  );
  ipcMain.handle("assignments:copyWeek", (_e, sourceDays: string[]) =>
    q.copyWeek(sourceDays)
  );

  // --- publish + history ---
  ipcMain.handle(
    "publish:week",
    (_e, days: string[], preface: string | null, onCallEmployeeId: string | null) =>
      publishWeek(days, preface, onCallEmployeeId)
  );
  ipcMain.handle("publish:resend", (_e, emailId: string) => resendEmail(emailId));
  ipcMain.handle("publishes:list", () => q.listPublishes());
  ipcMain.handle("publishes:latestForWeek", (_e, weekStartIso: string) =>
    q.latestPublishForWeek(weekStartIso)
  );

  ipcMain.handle("publishes:months", () => q.listPublishedMonths());
  ipcMain.handle("publishes:exportMonth", (_e, month: string) =>
    q.exportMonthShifts(month)
  );

  // --- unsent changes ---
  ipcMain.handle("drafts:hasUnsent", () => hasUnsentChanges());
  ipcMain.handle("drafts:unsentDates", () => unsentDates());
  ipcMain.handle("drafts:revert", () => revertUnsentChanges());

  // --- import ---
  ipcMain.handle("import:data", (_e, body: { customers: q.CustomerRecord[]; employees: q.EmployeeRecord[] }) =>
    q.importData(body)
  );

  // --- email setup (Settings → Email) ---
  ipcMain.handle("email:getConfig", () => getEmailConfig());
  ipcMain.handle("email:saveConfig", (_e, cfg: SmtpConfigInput) => saveEmailConfig(cfg));
  ipcMain.handle("email:savePassword", (_e, password: string) =>
    saveEmailPassword(password)
  );
  ipcMain.handle("email:sendTest", () => sendTestEmail());

  // --- launch gate (license + optional local password) ---
  // The password lock is purely local, so it must show INSTANTLY — never wait
  // on the network. The live license check (capped at 10s by the fetch
  // timeout) runs on every evaluation that gets past the password, so the
  // verdict is still fresh on every login. If the server is unreachable the
  // check no-ops and the gate falls back to the cached verdict + offline grace.
  ipcMain.handle("gate:state", async () => {
    const quick = getGateState();
    if (quick.mode === "needs-password") {
      // Warm the license verdict in the background while the user types their
      // password; the post-unlock evaluation joins it (or finds it fresh).
      void checkLicenseIfDue(true).then(() => {
        // A remote password reset may have just cleared the password while the
        // lock screen is up — tell the renderer so it unlocks right away
        // instead of waiting for a restart.
        if (!hasAppPassword()) {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send("gate:changed");
          }
        }
      });
      return quick;
    }
    await checkLicenseIfDue(true);
    return getGateState();
  });
  ipcMain.handle("gate:status", () => getLicenseStatus());
  // Re-check the license now (used by the verify-needed screen's "try again").
  ipcMain.handle("gate:recheck", async () => {
    await checkLicenseIfDue(true);
    return getGateState();
  });

  // --- bundled user guides (shipped with the install via extraResources) ---
  const GUIDES: Record<string, string> = {
    setup: "Henry-Setup-Guide.html",
    operations: "Henry-Operations-Guide.docx",
  };
  ipcMain.handle("docs:open", async (_e, key: string) => {
    const file = GUIDES[key];
    if (!file) return { error: "Unknown guide." };
    // Packaged: <resources>/docs/…; dev: the project root.
    const base = app.isPackaged
      ? path.join(process.resourcesPath, "docs")
      : app.getAppPath();
    const err = await shell.openPath(path.join(base, file));
    return err ? { error: err } : {};
  });

  // --- local app password ---
  ipcMain.handle("auth:hasPassword", () => hasAppPassword());
  ipcMain.handle("auth:unlock", (_e, password: string) => tryUnlock(password));
  ipcMain.handle("auth:lock", () => lock());
  // Set/change/remove. Requires the current password when one is already set.
  ipcMain.handle(
    "auth:setPassword",
    (_e, newPassword: string, currentPassword: string | null) => {
      if (hasAppPassword() && !verifyAppPassword(currentPassword ?? "")) {
        return { error: "Current password is incorrect." };
      }
      const res = setAppPassword(newPassword);
      if (!res.error) markUnlocked();
      return res;
    }
  );
}
