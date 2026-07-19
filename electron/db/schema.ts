// Authoritative SQLite schema for the Henry desktop app, applied on first launch.
// Single company per install, soft-delete via is_active, AM/PM shifts, one
// employee per shift. Additive column/table migrations for existing databases
// live in ./index.ts (create-table-if-not-exists here only covers fresh installs).
//
// App generates UUIDs for ids. Booleans are 0/1. Times 'HH:MM'. Dates 'YYYY-MM-DD'.
// Timestamps are TEXT (ISO). No company_id, each install is one company.

export const SCHEMA_SQL = `
create table if not exists customers (
  id           text primary key,
  name         text not null,
  address      text,
  contact_name text,
  phone        text,
  email        text,
  open_start   text,
  open_end     text,
  color        text default '#2563eb',
  notes        text,
  notify_email integer default 0,
  is_pinned    integer default 0,  -- [UI] pinned to the top of the schedule board (max 3)
  is_active    integer default 1,
  created_at   text default (datetime('now'))
);

create table if not exists employees (
  id          text primary key,
  name        text not null,
  eid         text,             -- [UI] Employee ID, shown/edited/imported/exported
  role        text,
  rating      integer check (rating between 1 and 10),
  phone       text,
  email       text,
  city        text,             -- [UI] shown/edited/imported/exported
  state       text,             -- [UI] shown/edited/imported/exported
  color       text default '#16a34a',
  is_on_call  integer default 0,
  is_active   integer default 1,
  created_at  text default (datetime('now'))
);

create table if not exists employee_time_off (
  id          text primary key,
  employee_id text references employees(id) on delete cascade,
  start_date  text not null,
  end_date    text not null,
  reason      text,
  created_at  text default (datetime('now'))
);

create table if not exists assignments (
  id          text primary key,
  customer_id text references customers(id) on delete cascade,
  employee_id text references employees(id) on delete cascade,
  work_date   text not null,
  shift       text not null check (shift in ('AM','PM')),
  status      text not null default 'draft' check (status in ('draft','published')),
  notes       text,
  created_at  text default (datetime('now')),
  unique (employee_id, work_date, shift)
);

create table if not exists publishes (
  id                  text primary key,
  work_date           text not null,
  preface_message     text,
  recipient_count     integer,
  on_call_employee_id text references employees(id) on delete set null,
  published_at        text default (datetime('now'))
);

create table if not exists emails (
  id          text primary key,
  publish_id  text references publishes(id) on delete cascade,
  employee_id text references employees(id) on delete set null,
  to_email    text,
  subject     text,
  body        text,
  html        text,
  status      text not null default 'queued'
               check (status in ('queued','sent','failed')),
  error       text,
  created_at  text default (datetime('now'))
);

-- [UI] Snapshot of a day's published assignments, written at publish time. Lets the
-- app detect/revert "unsent changes" to an already-published day and compute the
-- "already sent / unchanged" smart-republish status. Single tenant: no company_id.
create table if not exists assignment_snapshots (
  id          text primary key,
  work_date   text not null,
  customer_id text,
  employee_id text,
  shift       text not null check (shift in ('AM','PM')),
  notes       text,
  created_at  text default (datetime('now'))
);

create table if not exists settings (
  key   text primary key,
  value text
);

create index if not exists idx_assignments_date on assignments (work_date);
create index if not exists idx_assignments_employee on assignments (employee_id);
create index if not exists idx_timeoff_employee on employee_time_off (employee_id);
create index if not exists idx_emails_publish on emails (publish_id);
create index if not exists idx_snapshots_date on assignment_snapshots (work_date);

create unique index if not exists uniq_customer_name on customers (lower(name));
create unique index if not exists uniq_employee_name_email
  on employees (lower(name), coalesce(lower(email), ''));
`;

// Seed defaults written only when the settings table is empty (first launch).
// UNLOCKED by default (no license_endpoint set) so the app is usable when
// transported. company_name is intentionally BLANK: a fresh install must not
// ship another customer's name (it shows in the sidebar and signs every
// schedule email), and the dashboard setup checklist keys off the empty value
// to prompt the owner to enter their own before publishing.
export const SEED_SETTINGS: Record<string, string> = {
  company_name: "",
  is_licensed: "1",
  trial_ends_at: "",
};
