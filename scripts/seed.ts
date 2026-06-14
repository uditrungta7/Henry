// Seed two test companies with one login each and distinct data, for the phase-1
// isolation gate. Run with: npm run seed
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Idempotent-ish: re-running upserts data but will skip users that already exist.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader (no dependency).
function loadEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        let v = m[2].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (!process.env[m[1]]) process.env[m[1]] = v;
      }
    }
  } catch {
    // no .env.local — rely on the real environment
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Tenant = {
  companyName: string;
  email: string;
  password: string;
  customers: string[];
  employees: { name: string; email: string }[];
};

const tenants: Tenant[] = [
  {
    companyName: "Acme Electric",
    email: "owner-a@example.com",
    password: "password123",
    customers: ["Acme Customer One", "Acme Customer Two"],
    employees: [
      { name: "Alice Acme", email: "alice@example.com" },
      { name: "Andy Acme", email: "andy@example.com" },
    ],
  },
  {
    companyName: "Bolt Wiring",
    email: "owner-b@example.com",
    password: "password123",
    customers: ["Bolt Customer One", "Bolt Customer Two"],
    employees: [
      { name: "Bea Bolt", email: "bea@example.com" },
      { name: "Ben Bolt", email: "ben@example.com" },
    ],
  },
];

async function findUserByEmail(email: string) {
  // Auth admin has no get-by-email; page through the list (fine for seeding).
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
  return null;
}

async function seedTenant(t: Tenant) {
  // 1) Company (seeded unlocked by the schema default).
  const { data: company, error: cErr } = await admin
    .from("companies")
    .insert({ name: t.companyName })
    .select()
    .single();
  if (cErr) throw cErr;
  console.log(`Company: ${company.name} (${company.id})`);

  // 2) Auth user (or reuse if it already exists).
  let user = await findUserByEmail(t.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: t.email,
      password: t.password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`  Created login: ${t.email} / ${t.password}`);
  } else {
    console.log(`  Login already exists: ${t.email}`);
  }

  // 3) Map user -> company.
  const { error: auErr } = await admin
    .from("app_users")
    .upsert({ id: user.id, company_id: company.id, email: t.email });
  if (auErr) throw auErr;

  // 4) Distinct tenant data (service role bypasses RLS — scope by company_id).
  const { error: custErr } = await admin.from("customers").insert(
    t.customers.map((name) => ({ company_id: company.id, name }))
  );
  if (custErr) throw custErr;

  const { error: empErr } = await admin.from("employees").insert(
    t.employees.map((e) => ({
      company_id: company.id,
      name: e.name,
      email: e.email,
    }))
  );
  if (empErr) throw empErr;

  console.log(
    `  Seeded ${t.customers.length} customers, ${t.employees.length} employees`
  );
  return company.id;
}

async function main() {
  console.log("Seeding test companies…\n");
  for (const t of tenants) {
    await seedTenant(t);
  }
  console.log("\nDone. Log in as each owner to verify isolation:");
  for (const t of tenants) {
    console.log(`  ${t.companyName}: ${t.email} / ${t.password}`);
  }
}

main().catch((e) => {
  console.error("Seed failed:", e.message ?? e);
  process.exit(1);
});
