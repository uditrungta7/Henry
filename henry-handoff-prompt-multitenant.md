# Henry: build brief for Claude Code (multi-company web app, email delivery)

Paste this as your first message. Place two files in the repo root first: the
Karpathy `CLAUDE.md` (behavioral rules) and `henry-schema-multitenant.sql` (the
database schema). Drop the Rapier `.xlsx` export in too, so import reads its real
sheet names and columns.

---

## Working agreement (follow the repo CLAUDE.md on every step)

- Think before coding. State assumptions out loud. If a requirement is unclear or
  has more than one reading, stop and ask before writing code.
- Simplicity first. Minimum code that solves the task. No speculative features.
  Multi-company isolation IS required (below), so it is in scope; everything else
  stays lean.
- Surgical changes. Touch only what the step needs. Match existing style.
- Goal-driven. For each phase, restate the success check, build to it, verify it
  passes before moving on. Show a brief plan before a multi-step phase.
- Clean code: clear names, small functions, no dead code, no leftover console
  noise. Keep DB and email logic in server routes; keep React components small.

Ask me at every fork. A question now beats a rewrite later.

## What Henry is

A web-based scheduling app that serves MULTIPLE small contractor companies from
one deployment (first customer: Rapier Industries, a family electrical business
run by a non-technical owner). WE host it. Each company's owner opens a URL and
logs in, no install, no setup, nothing to configure, and sees ONLY their own
company's data. The owner enters customers and employees, books employees to
customer sites per shift, clicks Publish, and each employee receives a PLAIN-TEXT
email with where and when they work.

The owner does ALL assigning by hand. The app never auto-assigns; the employee
rating is reference only. Build it simple enough to use with zero training; the
target user came from nursing, not computing, so plain language, big obvious
buttons, guiding empty states. Multi-tenancy is invisible to her.

## Multi-company isolation (the highest-stakes part)

One deployment, one database, many companies. Every tenant table carries a
`company_id`. Postgres Row Level Security walls each company off so a user can
only ever read or write rows for their own company. The schema enables RLS and
defines the policies using an `auth_company_id()` helper that resolves the logged-
in user's company via the `app_users` mapping table.

Data access rules:
- Use the user's Supabase session (anon key + their JWT) for ALL tenant data, so
  RLS is enforced on every query.
- Use the service role key ONLY for provisioning and for the server-side email
  send, and when you do, scope every query by company_id explicitly, because the
  service key bypasses RLS.

Companies and logins are provisioned by US, not self-serve. There is NO public
signup. To add a company we insert a companies row, create a Supabase Auth user,
and insert an app_users row linking them (see the provisioning notes at the bottom
of the schema file). No admin UI for now.

## Delivery: plain-text email only

Schedules go out as plain-text emails to employees. No SMS, no Twilio, no
WhatsApp, no HTML or rich formatting, just plain lines. The email service is
configured by US on the server via env vars (email API key and a from-address).
The customer configures nothing and pays no per-message fee.

## License gate: built now, unlocked by default, per company

Each company row carries its own license state. Access is allowed when that
company's `is_licensed = true` OR `trial_ends_at IS NULL` OR `now() < trial_ends_at`.
New companies are seeded unlocked. The control exists so WE can change it per
company anytime in the database: to start a trial set is_licensed false and
trial_ends_at to a date; to mark purchased set is_licensed true. When a company's
trial has passed its date, show that company a simple "trial ended, contact us to
continue" screen and block use. The check runs server-side. Do not build a payment
flow or license-key UI.

## Stack

- Next.js 14 (App Router, TypeScript), server routes for DB and email
- Supabase (Postgres) free tier, with RLS for tenant isolation
- Supabase Auth, email and password (not magic links); each user maps to one
  company via app_users
- Tailwind + shadcn/ui
- dnd-kit (drag-and-drop board)
- SheetJS / xlsx (Excel import and export)
- Email via a transactional provider (Resend or nodemailer SMTP), plain text,
  keys in env: EMAIL_API_KEY (or SMTP creds) and EMAIL_FROM
- Deploy target: Cloudflare Pages or Netlify (free tier, commercial-safe)

## Data model

Load `henry-schema-multitenant.sql`. Tables: companies, app_users, customers,
employees, employee_time_off, assignments, publishes, emails. Every tenant table
has company_id; RLS is enabled with company-scoped policies. Shifts are AM or PM,
one employee per shift per company. Soft-delete via is_active, never hard delete.

## UI shape (plain and self-navigable)

Left nav: Schedule, Customers, Employees, Import, plus Publish history and
Settings. Read the company name from the logged-in user's company row; never
hardcode "Rapier" in the UI. The Schedule board is a grid: customers as rows,
Morning and Afternoon as columns, for the selected day, with a week-view toggle.
Color-code each employee and their jobs. Guiding empty states.

## Build in phases (verify each before the next)

1. App + auth + tenant isolation + license gate. Next.js running; Supabase
   connected; migration creates all tables and RLS policies; email/password login;
   logged-in user resolves to one company via app_users; a server-side guard reads
   that company's license state (allow when is_licensed OR trial_ends_at IS NULL OR
   now() < trial_ends_at; default seed unlocked).
   Verify (critical): create two companies with one login each and some rows in
   each; company A's login sees ONLY company A's data, never company B's. Then set
   company A is_licensed false and trial_ends_at in the past and confirm only
   company A sees the "trial ended" screen.

2. Excel import. Drop zone for .xlsx; parse "CUSTOMER DATA" and "EMPLOYEE DATA"
   with SheetJS; auto-detect columns with a mapping UI; flag rows missing an email;
   preview then confirm; upsert into the logged-in user's company, matching on
   (company_id, lower(name)) for customers and (company_id, lower(name), email) for
   employees.
   Verify: importing the Rapier file into company A populates only company A; a
   second import updates rather than duplicates.

3. Data screens. Customers and Employees CRUD: searchable tables, add/edit, archive
   (soft delete). Each customer has an "also email this customer" checkbox (default
   off; only used when the company's customer_email_enabled is on). Employee
   time-off ranges.
   Verify: add, edit, archive each; archived records leave past data intact.

4. Scheduling board. Day + week views; grid of customers x AM/PM; assign via
   dropdown then drag-and-drop; reassign, move, cancel; block double-booking with a
   clear message; warn on time-off and customer-closed (open_start/open_end); color
   coding; "copy week" to duplicate forward; short per-assignment notes.
   Verify: book AM and PM for one employee; a second same-shift booking is refused
   with a readable warning.

5. Publish via email. Publish button, optional preface box, on-call selector. Group
   the day's assignments by employee, compose ONE plain-text email each (format
   below), send via the server email route scoped to the company. Smart re-publish:
   only email employees whose assignments changed. Record a publishes row and an
   emails row per message with status; show delivery results with one-click resend
   on failure; flip sent assignments to published. Skip employees with no email and
   warn the boss.
   Verify: publishing sends a real plain-text email to a test address and the UI
   shows its delivery status.

6. History + export. Publish history list; export the company's customers and
   employees to Excel/CSV.
   Verify: history shows past publishes; export downloads valid files.

## Email format (final)

Subject: `Your work schedule - [Mon Jun 16]`

Body is plain text, no HTML. Use the company's name for the company line:
```
[preface message, if the boss entered one]

[Company name] schedule for Mon Jun 16:

AM: [Customer], [address] ([notes])
PM: [Customer], [address] ([notes])

On call: [name] ([phone])
```

Omission rules: drop the preface line if empty, drop a shift line if that shift is
unassigned, drop the On call line if no one is on call. Put the On call line in
every recipient's email, and also send the on-call person their own schedule email.

## Do NOT build

No public/self-serve signup (we provision companies). No org-switching for end
users (a user belongs to one company). No admin UI for provisioning yet. No SMS,
Twilio, WhatsApp, or any paid messaging. No HTML or rich-text email (plain text
only). No desktop or Electron build. No payment flow or license-key UI. No GPS,
routing, maps, invoicing, or auto-assignment. No feature gating of the trial; it is
fully functional and only time-limited.

## Start

State any assumptions you are making, then begin phase 1. The email format and
on-call behavior above are final; do not re-ask them. Treat the cross-company
isolation check in phase 1 as a hard gate before any later phase.
