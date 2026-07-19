-- Licenses for the desktop app. One row per install, keyed by the machine-derived
-- license_id the app sends to the check-license edge function. The function
-- auto-registers a trial row on first contact; you manage rows from the Supabase
-- dashboard (see README / check-license/index.ts).

create table if not exists licenses (
  id            text primary key,          -- machine-derived license_id from the app
  company_name  text,                      -- filled from the app's company hint or by hand
  is_licensed   boolean not null default false,
  trial_ends_at timestamptz,               -- null = no expiry
  revoked       boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Only the edge function (service role) touches this table. Enable RLS with no
-- policies so the anon key can't read or write it.
alter table licenses enable row level security;
