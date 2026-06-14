import { createClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/company";
import CustomersClient, { type Customer } from "./CustomersClient";

export default async function CustomersPage() {
  const company = await requireActiveCompany();
  const supabase = createClient();

  const { data } = await supabase
    .from("customers")
    .select(
      "id, name, address, contact_name, phone, open_start, open_end, color, notes, notify_email, is_active"
    )
    .order("name");

  return (
    <CustomersClient
      customers={(data ?? []) as Customer[]}
      customerEmailEnabled={company.customer_email_enabled}
    />
  );
}
