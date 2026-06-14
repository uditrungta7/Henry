# Henry

A web-based scheduling app that serves multiple small contractor companies from
one deployment. Each company's owner logs in and sees only their own data
(enforced by Postgres Row Level Security). The owner books employees to customer
sites per shift, clicks Publish, and each employee receives a plain-text email
with where and when they work.

## Stack

- Next.js 14 (App Router, TypeScript)
- Supabase (Postgres + Auth), RLS for tenant isolation
- Tailwind CSS
- Resend for plain-text email (added in phase 5)

## One-time setup

### 1. Create a Supabase project

1. Go to https://supabase.com, create a free project.
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Run the database migration

In the Supabase dashboard, open **SQL Editor**, paste the contents of
`supabase/migrations/0001_init.sql`, and run it. This creates all tables, the
`auth_company_id()` helper, indexes, and the RLS policies.

### 3. Configure env

```bash
cp .env.local.example .env.local
# fill in the three Supabase values (email values come in phase 5)
```

### 4. Install + seed test companies

```bash
npm install
npm run seed
```

`npm run seed` provisions two companies with one login each and distinct data,
for the isolation check below:

- **Acme Electric** — `owner-a@example.com` / `password123`
- **Bolt Wiring** — `owner-b@example.com` / `password123`

### 5. Run

```bash
npm run dev
# open http://localhost:3000
```

## Phase 1 verification (the hard gate)

**Isolation — a user must never see another company's data:**

1. Sign in as `owner-a@example.com`. The dashboard shows **only** Acme's
   customers (Acme Customer One/Two) and employees (Alice/Andy Acme).
2. Sign out, sign in as `owner-b@example.com`. You see **only** Bolt's data
   (Bolt Customer One/Two, Bea/Ben Bolt). Acme's data never appears.

**License gate — only the affected company is blocked:**

1. In the Supabase SQL Editor, end Acme's trial:
   ```sql
   update companies
   set is_licensed = false, trial_ends_at = now() - interval '1 day'
   where name = 'Acme Electric';
   ```
2. Sign in as `owner-a@example.com` → you see the **"Your trial has ended"**
   screen and cannot use the app.
3. Sign in as `owner-b@example.com` → Bolt is unaffected and works normally.
4. Re-enable Acme when done:
   ```sql
   update companies set is_licensed = true, trial_ends_at = null
   where name = 'Acme Electric';
   ```

## Provisioning a real company

Done by us, no public signup. See the steps at the bottom of
`supabase/migrations/0001_init.sql`, or run the seed pattern in `scripts/seed.ts`.

## Security notes

- All tenant data is read through the user's session (anon key + their JWT), so
  RLS is enforced on every query.
- The service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS and is used
  only server-side for provisioning and the email send — never sent to the
  browser, and every such query is scoped by `company_id` explicitly.
