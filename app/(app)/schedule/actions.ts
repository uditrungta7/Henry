"use client";

// Schedule (assignment) mutations. Same exported names/signatures as before, now
// backed by local SQLite through the Electron IPC bridge. Double-booking is
// enforced by the DB unique (employee_id, work_date, shift); the main process
// translates the violation into a readable message. Single tenant.

import { henry, emitDataChanged } from "@/lib/ipc/client";
import { weekDays } from "@/lib/dates";

type Shift = "AM" | "PM";
type ActionResult = { error?: string };

export async function assign(
  customerId: string,
  employeeId: string,
  workDate: string,
  shift: Shift
): Promise<ActionResult> {
  const res = await henry().assignments.assign(customerId, employeeId, workDate, shift);
  if (!res.error) emitDataChanged();
  return res;
}

export async function unassign(assignmentId: string): Promise<ActionResult> {
  const res = await henry().assignments.unassign(assignmentId);
  if (!res.error) emitDataChanged();
  return res;
}

export async function move(
  assignmentId: string,
  targetCustomerId: string,
  targetShift: Shift,
  targetAssignmentId: string | null
): Promise<ActionResult> {
  const res = await henry().assignments.move(
    assignmentId,
    targetCustomerId,
    targetShift,
    targetAssignmentId
  );
  if (!res.error) emitDataChanged();
  return res;
}

export async function setNotes(
  assignmentId: string,
  notes: string | null
): Promise<ActionResult> {
  const res = await henry().assignments.setNotes(assignmentId, notes);
  if (!res.error) emitDataChanged();
  return res;
}

// Pin/unpin a customer to the top of the board (max 3, enforced in the main
// process). Returns the error message when the limit is hit so the board can show it.
export async function setCustomerPinned(
  customerId: string,
  pinned: boolean
): Promise<ActionResult> {
  const res = await henry().customers.setPinned(customerId, pinned);
  if (!res.error) emitDataChanged();
  return res;
}

// Copy a week's assignments to next week. The caller still passes any date in the
// week (unchanged signature); we expand to the 7 Mon-Sun ISO dates here.
export async function copyWeek(
  anyDateInWeek: string
): Promise<ActionResult & { copied?: number; skipped?: number }> {
  const res = await henry().assignments.copyWeek(weekDays(anyDateInWeek));
  if (!res.error) emitDataChanged();
  return res;
}
