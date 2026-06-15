// One-time recolor: give every active customer and every active employee a
// distinct color, per company. Run with: npx tsx scripts/recolor.ts
//
// Existing imported rows all share a default color; this assigns each a unique
// color (curated palette first, then generated distinct HSL hues), ordered by
// name so the assignment is stable and sensible.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { colorForIndex } from "../lib/colors";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function recolor(
  table: "customers" | "employees",
  companyId: string
): Promise<number> {
  const { data: rows } = await admin
    .from(table)
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");
  if (!rows) return 0;

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const color = colorForIndex(i);
    const { error } = await admin
      .from(table)
      .update({ color })
      .eq("company_id", companyId)
      .eq("id", rows[i].id);
    if (error) throw error;
    updated++;
  }
  return updated;
}

async function main() {
  const { data: companies } = await admin.from("companies").select("id, name");
  for (const co of companies ?? []) {
    const c = await recolor("customers", co.id);
    const e = await recolor("employees", co.id);
    console.log(`${co.name}: recolored ${c} customers, ${e} employees`);
  }
  console.log("\nDone. Every active customer/employee now has a distinct color.");
}

main().catch((err) => {
  console.error("Recolor failed:", err.message ?? err);
  process.exit(1);
});
