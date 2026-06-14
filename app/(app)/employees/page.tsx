import { createClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/company";
import { isoToday } from "@/lib/dates";
import EmployeesClient, { type Employee } from "./EmployeesClient";

export default async function EmployeesPage() {
  await requireActiveCompany();
  const supabase = createClient();

  const { data } = await supabase
    .from("employees")
    .select(
      "id, name, eid, role, rating, phone, email, city, state, color, is_on_call, is_active, time_off:employee_time_off(id, start_date, end_date, reason)"
    )
    .order("name")
    // Soonest leave first, in both the table cell and the modal list.
    .order("start_date", { referencedTable: "employee_time_off", ascending: true });

  return (
    <EmployeesClient employees={(data ?? []) as Employee[]} today={isoToday()} />
  );
}
