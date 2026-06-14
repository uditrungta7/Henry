"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireLicensedCompany } from "@/lib/auth/company";

// Every mutating action gates the license via requireLicensedCompany().

export type EmployeeInput = {
  name: string;
  eid: string | null;
  role: string | null;
  rating: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  color: string;
  is_on_call: boolean;
};

export async function saveEmployee(
  id: string | null,
  input: EmployeeInput
): Promise<{ error?: string }> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();

  if (id) {
    const { error } = await supabase.from("employees").update(input).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("employees")
      .insert({ ...input, company_id: gate.companyId });
    if (error) return { error: error.message };
  }
  revalidatePath("/employees");
  return {};
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/employees");
  return {};
}

export async function addTimeOff(
  employeeId: string,
  start_date: string,
  end_date: string,
  reason: string | null
): Promise<{ error?: string }> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  if (end_date < start_date) {
    return { error: "End date can't be before the start date." };
  }
  const { error } = await supabase.from("employee_time_off").insert({
    company_id: gate.companyId,
    employee_id: employeeId,
    start_date,
    end_date,
    reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/employees");
  return {};
}

export async function removeTimeOff(id: string) {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  const { error } = await supabase
    .from("employee_time_off")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/employees");
  return {};
}
