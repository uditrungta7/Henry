import { createClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/company";
import { isoToday, weekDays } from "@/lib/dates";
import Board from "./schedule/Board";
import type {
  BoardCustomer,
  BoardEmployee,
  BoardAssignment,
  TimeOff,
} from "./schedule/types";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { date?: string; view?: string };
}) {
  const company = await requireActiveCompany();
  const supabase = createClient();

  const date = searchParams.date ?? isoToday();
  const view = searchParams.view === "week" ? "week" : "day";

  // The dates the board covers, so we fetch only the assignments we'll show.
  const days = view === "week" ? weekDays(date) : [date];
  const first = days[0];
  const last = days[days.length - 1];

  const [
    { data: customers },
    { data: employees },
    { data: assignments },
    { data: timeOff },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, address, color, open_start, open_end")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("employees")
      .select("id, name, color, email, phone")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("assignments")
      .select("id, customer_id, employee_id, work_date, shift, notes, status")
      .gte("work_date", first)
      .lte("work_date", last),
    // Time-off overlapping the visible window — for the on-time-off warning.
    supabase
      .from("employee_time_off")
      .select("employee_id, start_date, end_date")
      .lte("start_date", last)
      .gte("end_date", first),
  ]);

  return (
    <Board
      date={date}
      view={view}
      days={days}
      today={isoToday()}
      companyName={company.name}
      customers={(customers ?? []) as BoardCustomer[]}
      employees={(employees ?? []) as BoardEmployee[]}
      assignments={(assignments ?? []) as BoardAssignment[]}
      timeOff={(timeOff ?? []) as TimeOff[]}
    />
  );
}
