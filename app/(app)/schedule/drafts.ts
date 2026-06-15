"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireLicensedCompany } from "@/lib/auth/company";

// "Unsent changes" = edits to an already-published day that haven't been
// re-published. We detect/revert by comparing each published day's live
// assignments against its snapshot (written at publish time). Days that were
// never published have no snapshot and are never touched — so a future schedule
// the owner is still building is always safe.

type Row = {
  customer_id: string;
  employee_id: string;
  shift: string;
  notes: string | null;
};

const key = (r: Row) =>
  `${r.customer_id}|${r.employee_id}|${r.shift}|${r.notes ?? ""}`;

function sameSet(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  const bKeys = new Set(b.map(key));
  return a.every((r) => bKeys.has(key(r)));
}

// Does the company have any unsent edits to a published day?
export async function hasUnsentChanges(): Promise<boolean> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return false;
  const admin = createAdminClient();
  const companyId = gate.companyId;

  const { data: snaps } = await admin
    .from("assignment_snapshots")
    .select("work_date, customer_id, employee_id, shift, notes")
    .eq("company_id", companyId);
  if (!snaps || snaps.length === 0) return false;

  // Group snapshot rows by day.
  const snapByDay = new Map<string, Row[]>();
  for (const s of snaps) {
    const list = snapByDay.get(s.work_date) ?? [];
    list.push(s);
    snapByDay.set(s.work_date, list);
  }

  const dates = [...snapByDay.keys()];
  const { data: live } = await admin
    .from("assignments")
    .select("work_date, customer_id, employee_id, shift, notes")
    .eq("company_id", companyId)
    .in("work_date", dates);

  const liveByDay = new Map<string, Row[]>();
  for (const a of live ?? []) {
    const list = liveByDay.get(a.work_date) ?? [];
    list.push(a);
    liveByDay.set(a.work_date, list);
  }

  for (const [date, snapRows] of snapByDay) {
    if (!sameSet(snapRows, liveByDay.get(date) ?? [])) return true;
  }
  return false;
}

// Revert every published day back to its snapshot (the last sent version).
// Drafts on never-published days are untouched.
export async function revertUnsentChanges(): Promise<{ error?: string }> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();
  const companyId = gate.companyId;

  const { data: snaps } = await admin
    .from("assignment_snapshots")
    .select("work_date, customer_id, employee_id, shift, notes")
    .eq("company_id", companyId);
  if (!snaps || snaps.length === 0) return {};

  const snapByDay = new Map<string, Row[]>();
  for (const s of snaps) {
    const list = snapByDay.get(s.work_date) ?? [];
    list.push(s);
    snapByDay.set(s.work_date, list);
  }

  for (const [date, snapRows] of snapByDay) {
    // Replace the day's live assignments with the snapshot (restored as sent).
    const { error: delErr } = await admin
      .from("assignments")
      .delete()
      .eq("company_id", companyId)
      .eq("work_date", date);
    if (delErr) return { error: delErr.message };

    const { error: insErr } = await admin.from("assignments").insert(
      snapRows.map((r) => ({
        company_id: companyId,
        customer_id: r.customer_id,
        employee_id: r.employee_id,
        work_date: date,
        shift: r.shift,
        notes: r.notes,
        status: "published" as const,
      }))
    );
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/");
  return {};
}
