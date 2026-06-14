"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireLicensedCompany } from "@/lib/auth/company";
import { weekDays, addDays } from "@/lib/dates";

// All writes go through the RLS-enforced session client. Double-booking is
// enforced by the DB unique (company_id, employee_id, work_date, shift); we
// translate the unique-violation (Postgres 23505) into a readable message.
// Every mutating action gates the license via requireLicensedCompany().

type Shift = "AM" | "PM";
type ActionResult = { error?: string };

const DOUBLE_BOOK = "That employee is already booked for that shift this day.";

function describe(error: { code?: string; message: string }): string {
  if (error.code === "23505") return DOUBLE_BOOK;
  return error.message;
}

// Confirm a customer id belongs to the caller's company (RLS-scoped read).
// Guards against a crafted/cross-company id corrupting an assignment's FK.
async function customerInCompany(
  supabase: ReturnType<typeof createClient>,
  customerId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  return !!data;
}

export async function assign(
  customerId: string,
  employeeId: string,
  workDate: string,
  shift: Shift
): Promise<ActionResult> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();

  if (!(await customerInCompany(supabase, customerId))) {
    return { error: "That site is no longer available." };
  }

  const { error } = await supabase.from("assignments").insert({
    company_id: gate.companyId,
    customer_id: customerId,
    employee_id: employeeId,
    work_date: workDate,
    shift,
  });
  if (error) return { error: describe(error) };
  revalidatePath("/");
  return {};
}

export async function unassign(assignmentId: string): Promise<ActionResult> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

// Move an assignment to a different customer/shift on the same date. If the
// target cell already holds an assignment, the two swap.
export async function move(
  assignmentId: string,
  targetCustomerId: string,
  targetShift: Shift,
  targetAssignmentId: string | null
): Promise<ActionResult> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();

  if (!(await customerInCompany(supabase, targetCustomerId))) {
    return { error: "That site is no longer available." };
  }

  const { data: moving } = await supabase
    .from("assignments")
    .select("id, customer_id, shift, work_date")
    .eq("id", assignmentId)
    .single();
  if (!moving) return { error: "That assignment no longer exists." };

  if (targetAssignmentId) {
    // Swap: move the target into the source cell, then the source into target.
    // Step both to the destination in two updates; the unique constraint can't
    // be violated because each (employee, date, shift) row keeps its employee
    // and only customer/shift change, and we never put two of the same
    // employee in one shift here.
    const { error: e1 } = await supabase
      .from("assignments")
      .update({ customer_id: moving.customer_id, shift: moving.shift })
      .eq("id", targetAssignmentId);
    if (e1) return { error: describe(e1) };

    const { error: e2 } = await supabase
      .from("assignments")
      .update({ customer_id: targetCustomerId, shift: targetShift })
      .eq("id", assignmentId);
    if (e2) return { error: describe(e2) };
  } else {
    const { error } = await supabase
      .from("assignments")
      .update({ customer_id: targetCustomerId, shift: targetShift })
      .eq("id", assignmentId);
    if (error) return { error: describe(error) };
  }

  revalidatePath("/");
  return {};
}

export async function setNotes(
  assignmentId: string,
  notes: string | null
): Promise<ActionResult> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  const { error } = await supabase
    .from("assignments")
    .update({ notes })
    .eq("id", assignmentId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return {};
}

// Copy a week's assignments to the same weekdays of the following week as
// drafts. Skips any that would double-book (already booked next week).
export async function copyWeek(
  anyDateInWeek: string
): Promise<ActionResult & { copied?: number; skipped?: number }> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  const cid = gate.companyId;

  const days = weekDays(anyDateInWeek);
  const first = days[0];
  const last = days[6];

  const { data: source } = await supabase
    .from("assignments")
    .select("customer_id, employee_id, work_date, shift, notes")
    .gte("work_date", first)
    .lte("work_date", last);

  if (!source || source.length === 0) {
    return { error: "There are no assignments this week to copy." };
  }

  const rows = source.map((a) => ({
    company_id: cid,
    customer_id: a.customer_id,
    employee_id: a.employee_id,
    work_date: addDays(a.work_date, 7),
    shift: a.shift,
    notes: a.notes,
    status: "draft" as const,
  }));

  // Insert one at a time so a double-book (23505) skips just that row.
  let copied = 0;
  let skipped = 0;
  for (const row of rows) {
    const { error } = await supabase.from("assignments").insert(row);
    if (error) {
      if (error.code === "23505") skipped++;
      else return { error: error.message };
    } else {
      copied++;
    }
  }

  revalidatePath("/");
  return { copied, skipped };
}
