import type { BoardAssignment, BoardCustomer, Shift, TimeOff } from "./types";

// Non-blocking warnings shown when a booking looks questionable. The boss can
// still go ahead; these only flag, they never refuse.

// Is the employee on time off on this date?
export function onTimeOff(
  employeeId: string,
  date: string,
  timeOff: TimeOff[]
): boolean {
  return timeOff.some(
    (t) =>
      t.employee_id === employeeId &&
      t.start_date <= date &&
      t.end_date >= date
  );
}

// AM is roughly the morning, PM the afternoon. A site is "closed" for a shift
// when its open hours don't cover that half of the day. We treat noon as the
// AM/PM boundary: AM needs hours before 12:00, PM needs hours at/after 12:00.
export function customerClosed(
  customer: BoardCustomer,
  shift: Shift
): boolean {
  const { open_start, open_end } = customer;
  if (!open_start || !open_end) return false; // hours unknown -> don't warn

  const start = open_start.slice(0, 5);
  const end = open_end.slice(0, 5);

  if (shift === "AM") {
    // Open at all in the morning? Closed if they open at or after noon.
    return start >= "12:00";
  }
  // PM: closed if they shut at or before noon.
  return end <= "12:00";
}

// Which shift, if any, is currently underway or already over TODAY. Used to
// guard "people who are at / have been at work" from accidental edits.
//  - Before noon: AM is current (in progress); PM hasn't started.
//  - Noon or later: AM is over and PM is current; both count as "at work".
export type ShiftPhase = {
  amActive: boolean; // AM is current or past today
  pmActive: boolean; // PM is current or past today
};

export function shiftPhaseNow(now: Date): ShiftPhase {
  const afterNoon = now.getHours() >= 12;
  return { amActive: true, pmActive: afterNoon };
}

// An assignment is "at work" (locked against accidental change) when it is
// PUBLISHED, dated TODAY, and its shift is current or already past. These are
// people actually out on the job — changing them is almost always a mistake.
export function isAtWork(
  assignment: Pick<BoardAssignment, "status" | "work_date" | "shift">,
  today: string,
  phase: ShiftPhase
): boolean {
  if (assignment.status !== "published") return false;
  if (assignment.work_date !== today) return false;
  return assignment.shift === "AM" ? phase.amActive : phase.pmActive;
}
