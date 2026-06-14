-- Henry: multi-company (multi-tenant) scheduling app. One deployment, one DB.
-- Every company's data is isolated by company_id + Postgres Row Level Security.
-- Companies and their logins are provisioned by US (no public signup).
-- Postgres / Supabase. Run in the SQL editor.

-- Enums
create type shift_type as enum ('AM', 'PM');
create type assignment_status as enum ('draft', 'published');
create type email_status as enum ('queued', 'sent', 'failed');

-- One row per company (tenant): branding + license control.
-- Access allowed if is_licensed = true OR trial_ends_at IS NULL OR now() < trial_ends_at.
-- Seeded UNLOCKED. Change per company whenever: to start a trial set is_licensed
-- false and trial_ends_at to an end date; to mark purchased set is_licensed true.
create table companies (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  trial_ends_at          timestamptz,
  is_licensed            boolean default true,
  customer_email_enabled boolean default false,   -- optional customer-email feature, per company
  created_at             timestamptz default now()
);

-- Maps each Supabase Auth user to exactly one company.
create table app_users (
  id         uuid primary key,                    -- = auth.users.id
  company_id uuid not null references companies(id) on delete cascade,
  email      text,
  created_at timestamptz default now()
);

-- Helper: company_id of the currently authenticated user. Used by all RLS policies.
create or replace function auth_company_id()
returns uuid language sql stable as $$
  select company_id from app_users where id = auth.uid()
$$;

create table customers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  address      text,
  contact_name text,
  phone        text,            -- reference only
  email        text,            -- used only if notify_email is on (future feature)
  open_start   time,
  open_end     time,
  color        text default '#2563eb',
  notes        text,
  notify_email boolean default false,   -- "also email this customer" checkbox, off by default
  is_active    boolean default true,    -- soft archive, never hard-delete
  created_at   timestamptz default now()
);

create table employees (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  role        text,
  rating      int check (rating between 1 and 10),  -- experience, reference only
  phone       text,             -- reference only
  email       text,             -- delivery address for the schedule
  color       text default '#16a34a',
  is_on_call  boolean default false,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create table employee_time_off (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,
  created_at  timestamptz default now()
);

create table assignments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  work_date   date not null,
  shift       shift_type not null,
  status      assignment_status default 'draft',
  notes       text,
  created_at  timestamptz default now(),
  unique (company_id, employee_id, work_date, shift)   -- blocks double-booking within a company
);

create table publishes (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  work_date       date not null,
  preface_message text,
  recipient_count int,
  published_at    timestamptz default now()
);

create table emails (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  publish_id          uuid references publishes(id) on delete cascade,
  employee_id         uuid references employees(id) on delete set null,
  to_email            text,
  subject             text,
  body                text,            -- plain text only, no HTML
  status              email_status default 'queued',
  provider_message_id text,
  error               text,
  created_at          timestamptz default now()
);

-- Indexes
create index idx_customers_company on customers (company_id);
create index idx_employees_company on employees (company_id);
create index idx_assignments_company_date on assignments (company_id, work_date);
create index idx_timeoff_company on employee_time_off (company_id);
create index idx_publishes_company on publishes (company_id);
create index idx_emails_company on emails (company_id);

-- Per-company uniqueness (scoped, not global) for safe Excel re-import
create unique index uniq_customer_name_per_company on customers (company_id, lower(name));
create unique index uniq_employee_per_company on employees (company_id, lower(name), coalesce(lower(email), ''));

-- ============ Row Level Security: the wall between companies ============
alter table companies          enable row level security;
alter table app_users          enable row level security;
alter table customers          enable row level security;
alter table employees          enable row level security;
alter table employee_time_off  enable row level security;
alter table assignments        enable row level security;
alter table publishes          enable row level security;
alter table emails             enable row level security;

-- A user can read only their own company row and their own mapping.
create policy company_self_read on companies for select using (id = auth_company_id());
create policy appuser_self_read on app_users for select using (id = auth.uid());

-- Tenant tables: read/write limited to the user's own company.
create policy tenant_rw on customers         for all using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy tenant_rw on employees         for all using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy tenant_rw on employee_time_off for all using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy tenant_rw on assignments       for all using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy tenant_rw on publishes         for all using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy tenant_rw on emails            for all using (company_id = auth_company_id()) with check (company_id = auth_company_id());

-- ============ Provisioning a new company (do this in the Supabase dashboard) ============
-- 1) insert into companies (name) values ('Rapier Industries');           -- seeded unlocked
-- 2) create the boss's Auth user (Authentication > Users > Add user, email + password)
-- 3) insert into app_users (id, company_id, email)
--      values ('<that auth user id>', '<the company id>', '<boss email>');
-- No code change, no new deployment. Repeat per company.
