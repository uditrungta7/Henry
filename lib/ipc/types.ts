// Shared types for the renderer's IPC client. These mirror what the main-process
// query layer returns, and match exactly what the (frozen) screen components
// already expect as props.

export type Company = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  is_licensed: boolean;
  customer_email_enabled: boolean;
};

export type CustomerInput = {
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  open_start: string | null;
  open_end: string | null;
  color: string;
  notes: string | null;
  notify_email: boolean;
};

export type CustomerRow = CustomerInput & { id: string; is_active: boolean };

export type EmployeeInput = {
  name: string;
  eid: string | null;
  role: string | null;
  rating: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  color: string;
  is_on_call: boolean;
};

export type TimeOffRow = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

export type EmployeeRow = EmployeeInput & {
  id: string;
  is_active: boolean;
  time_off: TimeOffRow[];
};

export type BoardData = {
  customers: {
    id: string;
    name: string;
    address: string | null;
    color: string;
    open_start: string | null;
    open_end: string | null;
    is_pinned: boolean;
  }[];
  employees: {
    id: string;
    name: string;
    color: string;
    email: string | null;
    phone: string | null;
  }[];
  assignments: {
    id: string;
    customer_id: string;
    employee_id: string;
    work_date: string;
    shift: "AM" | "PM";
    notes: string | null;
    status: "draft" | "published";
  }[];
  timeOff: { employee_id: string; start_date: string; end_date: string }[];
};

export type ActionResult = { error?: string };

export type RecipientResult = {
  employeeId: string;
  name: string;
  email: string | null;
  status: "sent" | "failed" | "skipped" | "unchanged";
  detail?: string;
  emailId?: string;
  kind?: "employee" | "customer";
};

export type PublishResult = { error?: string; results?: RecipientResult[] };

export type EmailRecord = {
  id: string;
  to_email: string | null;
  status: "queued" | "sent" | "failed";
  error: string | null;
  employee: { name: string } | null;
};

export type PublishShift = {
  date: string;
  shift: string;
  customer: string;
  address: string | null;
  employee: string;
};

export type PublishRecord = {
  id: string;
  work_date: string;
  preface_message: string | null;
  recipient_count: number | null;
  on_call_name: string | null;
  published_at: string;
  emails: EmailRecord[];
  shifts: PublishShift[];
};

// The latest publish for a week: who was on call, and when it went out.
export type WeekPublishInfo = {
  on_call_employee_id: string | null;
  on_call_name: string | null;
  published_at: string;
};

export type MonthShiftRow = {
  employee: string;
  date: string;
  shift: string;
  customer: string;
  address: string;
};

export type ImportRecords = {
  customers: {
    name: string;
    contact_name: string | null;
    phone: string | null;
    address: string | null;
    open_start: string | null;
    open_end: string | null;
    color: string | null;
  }[];
  employees: {
    name: string;
    eid: string | null;
    role: string | null;
    rating: number | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    missingEmail: boolean;
  }[];
};

export type ImportResult = {
  customersAdded: number;
  customersUpdated: number;
  employeesAdded: number;
  employeesUpdated: number;
};

export type SmtpSecure = "tls" | "ssl" | "none";

// The non-secret SMTP fields saved to settings. Password is handled separately.
export type SmtpConfigInput = {
  provider: string;
  host: string;
  port: number;
  secure: SmtpSecure;
  username: string;
  fromEmail: string;
  fromName: string;
};

// What the form reads back: the saved config plus whether a password exists
// (the password itself is never returned to the renderer).
export type SmtpConfigState = {
  provider: string;
  host: string;
  port: number | null;
  secure: SmtpSecure | null;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
};

// Launch gate the renderer obeys (password first, then license).
export type GateState =
  | { mode: "needs-password" }
  | { mode: "license-ended" }
  | { mode: "verify-needed" }
  | { mode: "ok" };

export type LicenseStatus = {
  endpointConfigured: boolean;
  valid: boolean;
  isLicensed: boolean;
  trialEndsAt: string | null;
  lastChecked: string | null;
  licenseId: string;
};

// The full window.henry surface exposed by electron/preload.ts.
export type HenryApi = {
  ping: (msg: string) => Promise<{ ok: boolean; echo: string; at: string }>;
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  company: { get: () => Promise<Company> };
  customers: {
    list: () => Promise<CustomerRow[]>;
    save: (id: string | null, input: CustomerInput) => Promise<ActionResult>;
    setActive: (id: string, isActive: boolean) => Promise<ActionResult>;
    setPinned: (id: string, pinned: boolean) => Promise<ActionResult>;
  };
  employees: {
    list: () => Promise<EmployeeRow[]>;
    save: (id: string | null, input: EmployeeInput) => Promise<ActionResult>;
    setActive: (id: string, isActive: boolean) => Promise<ActionResult>;
  };
  timeOff: {
    add: (
      employeeId: string,
      start: string,
      end: string,
      reason: string | null
    ) => Promise<ActionResult>;
    remove: (id: string) => Promise<ActionResult>;
    getReasons: () => Promise<string[]>;
    setReasons: (reasons: string[]) => Promise<ActionResult>;
  };
  board: { get: (first: string, last: string) => Promise<BoardData> };
  assignments: {
    assign: (
      customerId: string,
      employeeId: string,
      workDate: string,
      shift: "AM" | "PM"
    ) => Promise<ActionResult>;
    unassign: (id: string) => Promise<ActionResult>;
    move: (
      assignmentId: string,
      targetCustomerId: string,
      targetShift: "AM" | "PM",
      targetAssignmentId: string | null
    ) => Promise<ActionResult>;
    setNotes: (id: string, notes: string | null) => Promise<ActionResult>;
    copyWeek: (
      sourceDays: string[]
    ) => Promise<ActionResult & { copied?: number; skipped?: number }>;
  };
  publish: {
    week: (
      days: string[],
      preface: string | null,
      onCallEmployeeId: string | null
    ) => Promise<PublishResult>;
    resend: (emailId: string) => Promise<ActionResult>;
  };
  publishes: {
    list: () => Promise<PublishRecord[]>;
    latestForWeek: (weekStartIso: string) => Promise<WeekPublishInfo | null>;
    months: () => Promise<string[]>;
    exportMonth: (month: string) => Promise<{ rows: MonthShiftRow[] }>;
  };
  drafts: {
    hasUnsent: () => Promise<boolean>;
    unsentDates: () => Promise<string[]>;
    revert: () => Promise<ActionResult>;
  };
  importData: (body: ImportRecords) => Promise<ImportResult>;
  email: {
    getConfig: () => Promise<SmtpConfigState>;
    saveConfig: (cfg: SmtpConfigInput) => Promise<ActionResult>;
    savePassword: (password: string) => Promise<ActionResult>;
    sendTest: () => Promise<{ ok: boolean; error?: string }>;
  };
  docs: {
    open: (key: "setup" | "operations") => Promise<{ error?: string }>;
  };
  gate: {
    state: () => Promise<GateState>;
    status: () => Promise<LicenseStatus>;
    recheck: () => Promise<GateState>;
    onChanged: (cb: () => void) => () => void;
  };
  auth: {
    hasPassword: () => Promise<boolean>;
    unlock: (password: string) => Promise<boolean>;
    lock: () => Promise<void>;
    setPassword: (
      newPassword: string,
      currentPassword: string | null
    ) => Promise<ActionResult>;
  };
};

declare global {
  interface Window {
    henry: HenryApi;
  }
}
