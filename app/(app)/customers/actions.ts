"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireLicensedCompany } from "@/lib/auth/company";

// All writes go through the RLS-enforced session client, so a row can only be
// created or changed within the logged-in user's company. We never set
// company_id from the client; the DB default + RLS check handle scoping.
// Every mutating action gates the license via requireLicensedCompany().

export type CustomerInput = {
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  open_start: string | null;
  open_end: string | null;
  color: string;
  notes: string | null;
  notify_email: boolean;
};

export async function saveCustomer(
  id: string | null,
  input: CustomerInput
): Promise<{ error?: string }> {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();

  if (id) {
    const { error } = await supabase.from("customers").update(input).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("customers")
      .insert({ ...input, company_id: gate.companyId });
    if (error) return { error: error.message };
  }
  revalidatePath("/customers");
  return {};
}

export async function setCustomerActive(id: string, isActive: boolean) {
  const gate = await requireLicensedCompany();
  if ("error" in gate) return { error: gate.error };
  const supabase = createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return {};
}
