"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// All writes go through the RLS-enforced session client, so a row can only be
// created or changed within the logged-in user's company. We never set
// company_id from the client; the DB default + RLS check handle scoping.

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

async function companyId() {
  const supabase = createClient();
  const { data } = await supabase.from("app_users").select("company_id").single();
  return { supabase, companyId: data?.company_id as string | undefined };
}

export async function saveCustomer(
  id: string | null,
  input: CustomerInput
): Promise<{ error?: string }> {
  const { supabase, companyId: cid } = await companyId();
  if (!cid) return { error: "No company found." };

  if (id) {
    const { error } = await supabase.from("customers").update(input).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("customers")
      .insert({ ...input, company_id: cid });
    if (error) return { error: error.message };
  }
  revalidatePath("/customers");
  return {};
}

export async function setCustomerActive(id: string, isActive: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from("customers")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  return {};
}
