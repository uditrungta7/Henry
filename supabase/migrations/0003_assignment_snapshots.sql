-- Snapshot of a day's published assignments, written each time that day is
-- published. Lets us revert unsent edits to an already-published day back to
-- exactly what was last sent (without touching never-published future drafts).
create table assignment_snapshots (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  work_date   date not null,
  customer_id uuid references customers(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  shift       shift_type not null,
  notes       text,
  created_at  timestamptz default now()
);

create index idx_snapshots_company_date
  on assignment_snapshots (company_id, work_date);

alter table assignment_snapshots enable row level security;

create policy tenant_rw on assignment_snapshots
  for all
  using (company_id = auth_company_id())
  with check (company_id = auth_company_id());
