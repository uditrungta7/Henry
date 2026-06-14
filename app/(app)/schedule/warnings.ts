import type { BoardCustomer, Shift, TimeOff } from "./types";

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
