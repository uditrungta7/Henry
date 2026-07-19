// Preload script: the ONLY bridge between the renderer (UI) and the main process.
// Runs with contextIsolation on, so the renderer sees just `window.henry`, never
// ipcRenderer, Node, or the database. Each method maps to one ipcMain.handle.

import { contextBridge, ipcRenderer } from "electron";

const invoke = ipcRenderer.invoke.bind(ipcRenderer);

const api = {
  ping: (msg: string) => invoke("app:ping", msg),

  settings: {
    get: (key: string) => invoke("settings:get", key) as Promise<string | null>,
    set: (key: string, value: string) => invoke("settings:set", key, value) as Promise<void>,
  },

  company: {
    get: () => invoke("company:get"),
  },

  customers: {
    list: () => invoke("customers:list"),
    save: (id: string | null, input: unknown) => invoke("customers:save", id, input),
    setActive: (id: string, isActive: boolean) =>
      invoke("customers:setActive", id, isActive),
    setPinned: (id: string, pinned: boolean) =>
      invoke("customers:setPinned", id, pinned),
  },

  employees: {
    list: () => invoke("employees:list"),
    save: (id: string | null, input: unknown) => invoke("employees:save", id, input),
    setActive: (id: string, isActive: boolean) =>
      invoke("employees:setActive", id, isActive),
  },

  timeOff: {
    add: (employeeId: string, start: string, end: string, reason: string | null) =>
      invoke("timeoff:add", employeeId, start, end, reason),
    remove: (id: string) => invoke("timeoff:remove", id),
    getReasons: () => invoke("timeoff:getReasons"),
    setReasons: (reasons: string[]) => invoke("timeoff:setReasons", reasons),
  },

  board: {
    get: (first: string, last: string) => invoke("board:get", first, last),
  },

  assignments: {
    assign: (customerId: string, employeeId: string, workDate: string, shift: "AM" | "PM") =>
      invoke("assignments:assign", customerId, employeeId, workDate, shift),
    unassign: (id: string) => invoke("assignments:unassign", id),
    move: (
      assignmentId: string,
      targetCustomerId: string,
      targetShift: "AM" | "PM",
      targetAssignmentId: string | null
    ) =>
      invoke("assignments:move", assignmentId, targetCustomerId, targetShift, targetAssignmentId),
    setNotes: (id: string, notes: string | null) =>
      invoke("assignments:setNotes", id, notes),
    copyWeek: (sourceDays: string[]) => invoke("assignments:copyWeek", sourceDays),
  },

  publish: {
    week: (days: string[], preface: string | null, onCallEmployeeId: string | null) =>
      invoke("publish:week", days, preface, onCallEmployeeId),
    resend: (emailId: string) => invoke("publish:resend", emailId),
  },

  publishes: {
    list: () => invoke("publishes:list"),
    latestForWeek: (weekStartIso: string) =>
      invoke("publishes:latestForWeek", weekStartIso),
    months: () => invoke("publishes:months"),
    exportMonth: (month: string) => invoke("publishes:exportMonth", month),
  },

  drafts: {
    hasUnsent: () => invoke("drafts:hasUnsent") as Promise<boolean>,
    unsentDates: () => invoke("drafts:unsentDates") as Promise<string[]>,
    revert: () => invoke("drafts:revert"),
  },

  importData: (body: unknown) => invoke("import:data", body),

  email: {
    getConfig: () => invoke("email:getConfig"),
    saveConfig: (cfg: unknown) => invoke("email:saveConfig", cfg),
    savePassword: (password: string) => invoke("email:savePassword", password),
    sendTest: () => invoke("email:sendTest"),
  },

  docs: {
    open: (key: string) => invoke("docs:open", key) as Promise<{ error?: string }>,
  },

  gate: {
    state: () => invoke("gate:state"),
    status: () => invoke("gate:status"),
    recheck: () => invoke("gate:recheck"),
    // Fired by the main process when the gate verdict changes behind the
    // renderer's back (e.g. a remote password reset landed at the lock screen).
    onChanged: (cb: () => void): (() => void) => {
      const listener = () => cb();
      ipcRenderer.on("gate:changed", listener);
      return () => ipcRenderer.removeListener("gate:changed", listener);
    },
  },

  auth: {
    hasPassword: () => invoke("auth:hasPassword") as Promise<boolean>,
    unlock: (password: string) => invoke("auth:unlock", password) as Promise<boolean>,
    lock: () => invoke("auth:lock") as Promise<void>,
    setPassword: (newPassword: string, currentPassword: string | null) =>
      invoke("auth:setPassword", newPassword, currentPassword),
  },
};

contextBridge.exposeInMainWorld("henry", api);

export type HenryApi = typeof api;
