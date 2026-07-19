// Main-process data layer: one function per query the app makes, running SQL
// against the local SQLite database. These replace every Supabase call from the
// old web app. Single tenant, no company_id, no RLS. Ids are app-generated UUIDs.
//
// Return shapes match exactly what the (frozen) renderer components expect, so the
// UI is unchanged. Booleans are stored 0/1 in SQLite and converted to JS booleans
// on the way out.

import { randomUUID } from "node:crypto";
import { getDatabase } from "./index";
import { nextUnusedColor } from "./colors";

const b = (v: unknown): boolean => v === 1 || v === true; // 0/1 -> boolean
const i = (v: boolean): number => (v ? 1 : 0); // boolean -> 0/1

// ---------------------------------------------------------------------------
// Company / settings
// ---------------------------------------------------------------------------

export type Company = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  is_licensed: boolean;
  customer_email_enabled: boolean;
};

function getSetting(key: string): string | null {
  const row = getDatabase()
    .prepare("select value from settings where key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

// The single company for this install, assembled from the settings table.
// id is a stable constant since there is only ever one company per install.
export function getCompany(): Company {
  const name = getSetting("company_name") ?? "Henry";
  const trial = getSetting("trial_ends_at");
  return {
    id: "local",
    name,
    trial_ends_at: trial && trial.length > 0 ? trial : null,
    is_licensed: getSetting("is_licensed") === "1",
    // Customer-email feature flag; off unless explicitly enabled in settings.
    customer_email_enabled: getSetting("customer_email_enabled") === "1",
  };
}

// ---------------------------------------------------------------------------
// Time-off reasons (boss-editable dropdown options, stored as JSON in settings)
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOFF_REASONS = ["Vacation", "Sick", "Personal", "Unpaid"];

export function getTimeOffReasons(): string[] {
  const raw = getSetting("timeoff_reasons");
  if (!raw) return DEFAULT_TIMEOFF_REASONS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : DEFAULT_TIMEOFF_REASONS;
  } catch {
    return DEFAULT_TIMEOFF_REASONS;
  }
}

// Replace the full list (the Settings UI sends the edited list). De-duplicates
// and drops blanks. Persisted as JSON in the settings table.
export function setTimeOffReasons(reasons: string[]): { error?: string } {
  const clean = [...new Set(reasons.map((r) => r.trim()).filter(Boolean))];
  getDatabase()
    .prepare(
      "insert into settings (key, value) values ('timeoff_reasons', ?) " +
        "on conflict(key) do update set value = excluded.value"
    )
    .run(JSON.stringify(clean));
  return {};
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

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

// Full customer list (active + archived), ordered by name. Matches the
// Customers screen's select.
export function listCustomers() {
  const rows = getDatabase()
    .prepare(
      "select id, name, address, contact_name, phone, open_start, open_end, " +
        "color, notes, notify_email, is_active from customers order by name"
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    ...r,
    notify_email: b(r.notify_email),
    is_active: b(r.is_active),
  }));
}

export function saveCustomer(
  id: string | null,
  input: CustomerInput
): { error?: string } {
  // Reject blank names ('' passes the NOT NULL constraint).
  if (!input.name || !input.name.trim()) return { error: "Please enter a name." };
  const db = getDatabase();
  try {
    if (id) {
      db.prepare(
        "update customers set name=@name, address=@address, " +
          "contact_name=@contact_name, phone=@phone, open_start=@open_start, " +
          "open_end=@open_end, color=@color, notes=@notes, notify_email=@notify_email " +
          "where id=@id"
      ).run({ ...input, notify_email: i(input.notify_email), id });
    } else {
      db.prepare(
        "insert into customers (id, name, address, contact_name, phone, " +
          "open_start, open_end, color, notes, notify_email) values " +
          "(@id, @name, @address, @contact_name, @phone, @open_start, @open_end, " +
          "@color, @notes, @notify_email)"
      ).run({ ...input, notify_email: i(input.notify_email), id: randomUUID() });
    }
    return {};
  } catch (e) {
    return { error: messageFor(e) };
  }
}

export function setCustomerActive(id: string, isActive: boolean): { error?: string } {
  getDatabase()
    .prepare("update customers set is_active=? where id=?")
    .run(i(isActive), id);
  return {};
}

// Max customers that can be pinned to the top of the schedule board.
const MAX_PINNED = 3;

// Pin/unpin a customer. Pinning is capped at MAX_PINNED; going over returns a
// readable error the board surfaces instead of silently ignoring the click.
export function setCustomerPinned(id: string, pinned: boolean): { error?: string } {
  const db = getDatabase();
  if (pinned) {
    const row = db
      .prepare("select count(*) as n from customers where is_pinned=1 and id<>?")
      .get(id) as { n: number };
    if (row.n >= MAX_PINNED) {
      return {
        error: `You can pin at most ${MAX_PINNED} customers. Unpin one first.`,
      };
    }
  }
  db.prepare("update customers set is_pinned=? where id=?").run(i(pinned), id);
  return {};
}

// ---------------------------------------------------------------------------
// Employees (+ time off)
// ---------------------------------------------------------------------------

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

// Employees with their time-off, name-ordered, time-off soonest-first, matches
// the Employees screen's nested select + ordering.
export function listEmployees() {
  const db = getDatabase();
  const emps = db
    .prepare(
      "select id, name, eid, role, rating, phone, email, city, state, color, " +
        "is_on_call, is_active from employees order by name"
    )
    .all() as Record<string, unknown>[];
  const timeOff = db
    .prepare(
      "select id, employee_id, start_date, end_date, reason from employee_time_off " +
        "order by start_date asc"
    )
    .all() as Record<string, unknown>[];
  const byEmp = new Map<string, Record<string, unknown>[]>();
  for (const t of timeOff) {
    const list = byEmp.get(t.employee_id as string) ?? [];
    list.push({ id: t.id, start_date: t.start_date, end_date: t.end_date, reason: t.reason });
    byEmp.set(t.employee_id as string, list);
  }
  return emps.map((e) => ({
    ...e,
    is_on_call: b(e.is_on_call),
    is_active: b(e.is_active),
    time_off: byEmp.get(e.id as string) ?? [],
  }));
}

export function saveEmployee(
  id: string | null,
  input: EmployeeInput
): { error?: string } {
  // Reject blank names.
  if (!input.name || !input.name.trim()) return { error: "Please enter a name." };
  const db = getDatabase();
  try {
    if (id) {
      db.prepare(
        "update employees set name=@name, eid=@eid, role=@role, rating=@rating, " +
          "phone=@phone, email=@email, city=@city, state=@state, color=@color, " +
          "is_on_call=@is_on_call where id=@id"
      ).run({ ...input, is_on_call: i(input.is_on_call), id });
    } else {
      db.prepare(
        "insert into employees (id, name, eid, role, rating, phone, email, city, " +
          "state, color, is_on_call) values (@id, @name, @eid, @role, @rating, " +
          "@phone, @email, @city, @state, @color, @is_on_call)"
      ).run({ ...input, is_on_call: i(input.is_on_call), id: randomUUID() });
    }
    return {};
  } catch (e) {
    return { error: messageFor(e) };
  }
}

export function setEmployeeActive(id: string, isActive: boolean): { error?: string } {
  getDatabase()
    .prepare("update employees set is_active=? where id=?")
    .run(i(isActive), id);
  return {};
}

export function addTimeOff(
  employeeId: string,
  start_date: string,
  end_date: string,
  reason: string | null
): { error?: string } {
  if (end_date < start_date) {
    return { error: "End date can't be before the start date." };
  }
  getDatabase()
    .prepare(
      "insert into employee_time_off (id, employee_id, start_date, end_date, reason) " +
        "values (?, ?, ?, ?, ?)"
    )
    .run(randomUUID(), employeeId, start_date, end_date, reason);
  return {};
}

export function removeTimeOff(id: string): { error?: string } {
  getDatabase().prepare("delete from employee_time_off where id=?").run(id);
  return {};
}

// ---------------------------------------------------------------------------
// Schedule board reads
// ---------------------------------------------------------------------------

// Everything the board needs for a date window: active customers, active
// employees, assignments in range, and overlapping time-off.
export function getBoardData(first: string, last: string) {
  const db = getDatabase();
  const customers = (db
    .prepare(
      "select id, name, address, color, open_start, open_end, is_pinned from customers " +
        "where is_active=1 order by is_pinned desc, name"
    )
    .all() as Record<string, unknown>[]).map((c) => ({ ...c, is_pinned: b(c.is_pinned) }));
  const employees = db
    .prepare(
      "select id, name, color, email, phone from employees where is_active=1 order by name"
    )
    .all();
  const assignments = db
    .prepare(
      "select id, customer_id, employee_id, work_date, shift, notes, status " +
        "from assignments where work_date >= ? and work_date <= ?"
    )
    .all(first, last);
  const timeOff = db
    .prepare(
      "select employee_id, start_date, end_date from employee_time_off " +
        "where start_date <= ? and end_date >= ?"
    )
    .all(last, first);
  return { customers, employees, assignments, timeOff };
}

// ---------------------------------------------------------------------------
// Schedule mutations
// ---------------------------------------------------------------------------

type Shift = "AM" | "PM";

// SQLite unique-constraint violation -> the readable double-book message.
const DOUBLE_BOOK = "That employee is already booked for that shift this day.";
function describe(e: unknown): string {
  const msg = messageFor(e);
  if (/unique/i.test(msg)) return DOUBLE_BOOK;
  return msg;
}

function customerExists(customerId: string): boolean {
  const row = getDatabase()
    .prepare("select id from customers where id=?")
    .get(customerId);
  return !!row;
}

export function assign(
  customerId: string,
  employeeId: string,
  workDate: string,
  shift: Shift
): { error?: string } {
  if (!customerExists(customerId)) return { error: "That site is no longer available." };
  try {
    getDatabase()
      .prepare(
        "insert into assignments (id, customer_id, employee_id, work_date, shift) " +
          "values (?, ?, ?, ?, ?)"
      )
      .run(randomUUID(), customerId, employeeId, workDate, shift);
    return {};
  } catch (e) {
    return { error: describe(e) };
  }
}

export function unassign(assignmentId: string): { error?: string } {
  getDatabase().prepare("delete from assignments where id=?").run(assignmentId);
  return {};
}

export function move(
  assignmentId: string,
  targetCustomerId: string,
  targetShift: Shift,
  targetAssignmentId: string | null
): { error?: string } {
  const db = getDatabase();
  if (!customerExists(targetCustomerId))
    return { error: "That site is no longer available." };

  const moving = db
    .prepare("select id, customer_id, shift, work_date from assignments where id=?")
    .get(assignmentId) as
    | { id: string; customer_id: string; shift: string; work_date: string }
    | undefined;
  if (!moving) return { error: "That assignment no longer exists." };

  try {
    if (targetAssignmentId) {
      // Swap: target takes the moving assignment's old cell, then moving lands in
      // target. Both UPDATEs must commit together — if the second violates the
      // unique(employee_id, work_date, shift) index, the first must roll back too,
      // or the board silently keeps a half-moved, corrupted schedule.
      const update = db.prepare("update assignments set customer_id=?, shift=? where id=?");
      const swap = db.transaction(() => {
        update.run(moving.customer_id, moving.shift, targetAssignmentId);
        update.run(targetCustomerId, targetShift, assignmentId);
      });
      swap();
    } else {
      db.prepare("update assignments set customer_id=?, shift=? where id=?").run(
        targetCustomerId,
        targetShift,
        assignmentId
      );
    }
    return {};
  } catch (e) {
    return { error: describe(e) };
  }
}

export function setNotes(
  assignmentId: string,
  notes: string | null
): { error?: string } {
  getDatabase().prepare("update assignments set notes=? where id=?").run(notes, assignmentId);
  return {};
}

// Copy a week's assignments to the same weekdays next week, as drafts. Skips
// double-books. days[0..6] are the Sun-Sat ISO dates of the source week.
export function copyWeek(
  sourceDays: string[]
): { error?: string; copied?: number; skipped?: number } {
  const db = getDatabase();
  const first = sourceDays[0];
  const last = sourceDays[6];
  const source = db
    .prepare(
      "select customer_id, employee_id, work_date, shift, notes from assignments " +
        "where work_date >= ? and work_date <= ?"
    )
    .all(first, last) as {
    customer_id: string;
    employee_id: string;
    work_date: string;
    shift: string;
    notes: string | null;
  }[];
  if (source.length === 0) {
    return { error: "There are no assignments this week to copy." };
  }
  const addSeven = db.prepare(
    "insert into assignments (id, customer_id, employee_id, work_date, shift, notes, status) " +
      "values (?, ?, ?, ?, ?, ?, 'draft')"
  );
  let copied = 0;
  let skipped = 0;
  for (const a of source) {
    const nextDate = addDaysIso(a.work_date, 7);
    try {
      addSeven.run(randomUUID(), a.customer_id, a.employee_id, nextDate, a.shift, a.notes);
      copied++;
    } catch (e) {
      if (/unique/i.test(messageFor(e))) skipped++;
      else return { error: messageFor(e) };
    }
  }
  return { copied, skipped };
}

// ---------------------------------------------------------------------------
// Publish history reads
// ---------------------------------------------------------------------------

// All publishes newest-first, each with its email rows (and recipient name).
export function listPublishes() {
  const db = getDatabase();
  const publishes = db
    .prepare(
      "select p.id, p.work_date, p.preface_message, p.recipient_count, p.published_at, " +
        "oc.name as on_call_name from publishes p " +
        "left join employees oc on oc.id = p.on_call_employee_id " +
        "order by p.published_at desc"
    )
    .all() as Record<string, unknown>[];
  const emails = db
    .prepare(
      "select e.id, e.publish_id, e.to_email, e.status, e.error, emp.name as emp_name " +
        "from emails e left join employees emp on emp.id = e.employee_id"
    )
    .all() as Record<string, unknown>[];
  const byPublish = new Map<string, Record<string, unknown>[]>();
  for (const e of emails) {
    const list = byPublish.get(e.publish_id as string) ?? [];
    list.push({
      id: e.id,
      to_email: e.to_email,
      status: e.status,
      error: e.error,
      employee: e.emp_name ? { name: e.emp_name } : null,
    });
    byPublish.set(e.publish_id as string, list);
  }
  // Shift detail (what day/shift, which employee, which site) from the
  // assignment snapshots written at publish time, the authoritative "what was
  // sent". Snapshots are keyed by work_date (latest published state for that
  // day); a publish covers its week, work_date .. work_date+6.
  const snaps = db
    .prepare(
      "select s.work_date, s.shift, c.name as customer_name, c.address, " +
        "e.name as employee_name from assignment_snapshots s " +
        "left join customers c on c.id = s.customer_id " +
        "left join employees e on e.id = s.employee_id " +
        "order by s.work_date"
    )
    .all() as {
    work_date: string;
    shift: string;
    customer_name: string | null;
    address: string | null;
    employee_name: string | null;
  }[];
  const shiftSort = (a: { date: string; shift: string }, b: { date: string; shift: string }) =>
    a.date.localeCompare(b.date) ||
    (a.shift === "AM" ? 0 : 1) - (b.shift === "AM" ? 0 : 1);

  return publishes.map((p) => {
    const first = p.work_date as string;
    const last = addDaysIso(first, 6);
    return {
      ...p,
      emails: byPublish.get(p.id as string) ?? [],
      shifts: snaps
        .filter((s) => s.work_date >= first && s.work_date <= last)
        .map((s) => ({
          date: s.work_date,
          shift: s.shift,
          customer: s.customer_name ?? "Unknown",
          address: s.address,
          employee: s.employee_name ?? "Unknown",
        }))
        .sort(shiftSort),
    };
  });
}

// The most recent publish for a week (keyed by its start date), with the
// on-call person resolved to a name. Powers the board's "On call" chip and the
// publish panel's prefill. Order by rowid (monotonic), not published_at
// (1-second resolution -> ties on rapid re-publishes).
export function latestPublishForWeek(weekStartIso: string): {
  on_call_employee_id: string | null;
  on_call_name: string | null;
  published_at: string;
} | null {
  const db = getDatabase();
  const row = db
    .prepare(
      "select p.on_call_employee_id, oc.name as on_call_name, p.published_at " +
        "from publishes p left join employees oc on oc.id = p.on_call_employee_id " +
        "where p.work_date = ? order by p.rowid desc limit 1"
    )
    .get(weekStartIso) as
    | { on_call_employee_id: string | null; on_call_name: string | null; published_at: string }
    | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Monthly shift export (for shift-based pay tracking). One row per published
// shift in the given month (YYYY-MM): employee, date, shift, customer, address.
// Built from assignment_snapshots (what was actually published).
// ---------------------------------------------------------------------------

export function exportMonthShifts(month: string): {
  rows: {
    employee: string;
    date: string;
    shift: string;
    customer: string;
    address: string;
  }[];
} {
  // month is 'YYYY-MM'; match work_date like 'YYYY-MM-%'.
  const rows = getDatabase()
    .prepare(
      "select s.work_date as date, s.shift, " +
        "coalesce(e.name,'Unknown') as employee, " +
        "coalesce(c.name,'Unknown') as customer, coalesce(c.address,'') as address " +
        "from assignment_snapshots s " +
        "left join customers c on c.id = s.customer_id " +
        "left join employees e on e.id = s.employee_id " +
        "where s.work_date like ? " +
        "order by s.work_date, e.name, s.shift"
    )
    .all(month + "-%") as {
    employee: string;
    date: string;
    shift: string;
    customer: string;
    address: string;
  }[];
  return { rows };
}

// Months that have published shifts (for the export month picker), newest first.
export function listPublishedMonths(): string[] {
  const rows = getDatabase()
    .prepare(
      "select distinct substr(work_date,1,7) as month from assignment_snapshots order by month desc"
    )
    .all() as { month: string }[];
  return rows.map((r) => r.month);
}

// ---------------------------------------------------------------------------
// Excel import upsert (was /api/import). Match: customers on lower(name);
// employees on lower(name)+email. Blank incoming never overwrites a non-blank.
// ---------------------------------------------------------------------------

export type CustomerRecord = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  open_start: string | null;
  open_end: string | null;
  color: string | null;
};

export type EmployeeRecord = {
  name: string;
  eid: string | null;
  role: string | null;
  rating: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  missingEmail: boolean;
};

const preferIncoming = <T>(incoming: T | null, existing: T | null): T | null =>
  incoming === null || (incoming as unknown) === "" ? existing : incoming;

export function importData(body: {
  customers: CustomerRecord[];
  employees: EmployeeRecord[];
}): {
  customersAdded: number;
  customersUpdated: number;
  employeesAdded: number;
  employeesUpdated: number;
} {
  const db = getDatabase();
  let customersAdded = 0;
  let customersUpdated = 0;
  let employeesAdded = 0;
  let employeesUpdated = 0;

  const run = db.transaction(() => {
    // Customers, matched on lower(name).
    const existingCustomers = db
      .prepare(
        "select id, name, contact_name, phone, address, open_start, open_end, color from customers"
      )
      .all() as Record<string, unknown>[];
    const customerByName = new Map(
      existingCustomers.map((c) => [(c.name as string).trim().toLowerCase(), c])
    );
    const customerColors = existingCustomers.map((c) => c.color as string);

    for (const rec of body.customers) {
      if (!rec.name.trim()) continue;
      const existing = customerByName.get(rec.name.trim().toLowerCase());
      if (existing) {
        db.prepare(
          "update customers set contact_name=@contact_name, phone=@phone, " +
            "address=@address, open_start=@open_start, open_end=@open_end, color=@color where id=@id"
        ).run({
          contact_name: preferIncoming(rec.contact_name, existing.contact_name as string | null),
          phone: preferIncoming(rec.phone, existing.phone as string | null),
          address: preferIncoming(rec.address, existing.address as string | null),
          open_start: preferIncoming(rec.open_start, existing.open_start as string | null),
          open_end: preferIncoming(rec.open_end, existing.open_end as string | null),
          color: rec.color ?? (existing.color as string),
          id: existing.id,
        });
        customersUpdated++;
      } else {
        const color = rec.color ?? nextUnusedColor(customerColors);
        customerColors.push(color);
        db.prepare(
          "insert into customers (id, name, contact_name, phone, address, open_start, open_end, color) " +
            "values (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          randomUUID(),
          rec.name.trim(),
          rec.contact_name,
          rec.phone,
          rec.address,
          rec.open_start,
          rec.open_end,
          color
        );
        customersAdded++;
      }
    }

    // Employees, matched on lower(name)+lower(email).
    const existingEmployees = db
      .prepare(
        "select id, name, email, role, rating, phone, eid, city, state, color from employees"
      )
      .all() as Record<string, unknown>[];
    const empKey = (name: string, email: string | null) =>
      `${name.trim().toLowerCase()}|${(email ?? "").toLowerCase()}`;
    const employeeByKey = new Map(
      existingEmployees.map((e) => [empKey(e.name as string, e.email as string | null), e])
    );
    const employeeColors = existingEmployees.map((e) => e.color as string);

    for (const rec of body.employees) {
      if (!rec.name.trim()) continue;
      const existing = employeeByKey.get(empKey(rec.name, rec.email));
      if (existing) {
        db.prepare(
          "update employees set role=@role, rating=@rating, phone=@phone, eid=@eid, " +
            "city=@city, state=@state where id=@id"
        ).run({
          role: preferIncoming(rec.role, existing.role as string | null),
          rating: rec.rating ?? (existing.rating as number | null),
          phone: preferIncoming(rec.phone, existing.phone as string | null),
          eid: preferIncoming(rec.eid, existing.eid as string | null),
          city: preferIncoming(rec.city, existing.city as string | null),
          state: preferIncoming(rec.state, existing.state as string | null),
          id: existing.id,
        });
        employeesUpdated++;
      } else {
        const color = nextUnusedColor(employeeColors);
        employeeColors.push(color);
        db.prepare(
          "insert into employees (id, name, role, rating, phone, email, eid, city, state, color) " +
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          randomUUID(),
          rec.name.trim(),
          rec.role,
          rec.rating,
          rec.phone,
          rec.email,
          rec.eid,
          rec.city,
          rec.state,
          color
        );
        employeesAdded++;
      }
    }
  });

  run();
  return { customersAdded, customersUpdated, employeesAdded, employeesUpdated };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Local-date math in ISO (YYYY-MM-DD), timezone-safe (mirrors lib/dates addDays).
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
