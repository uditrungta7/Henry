import { createClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/company";
import EmployeesClient, { type Employee } from "./EmployeesClient";

export default async function EmployeesPage() {
  await requireActiveCompany();
  const supabase = createClient();

  const { data } = await supabase
    .from("employees")
    .select(
      "id, name, role, rating, phone, email, color, is_on_call, is_active, time_off:employee_time_off(id, start_date, end_date, reason)"
    )
    .order("name")
    // Soonest leave first, in both the table cell and the modal list.
    .order("start_date", { referencedTable: "employee_time_off", ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  return (
    <EmployeesClient employees={(data ?? []) as Employee[]} today={today} />
  );
}
