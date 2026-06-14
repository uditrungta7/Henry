import { createClient } from "@/lib/supabase/server";
import { requireActiveCompany } from "@/lib/auth/company";
import ExportClient, { type ExportData } from "./ExportClient";

export default async function SettingsPage() {
  const company = await requireActiveCompany();
  const supabase = createClient();

  const [{ data: customers }, { data: employees }] = await Promise.all([
    supabase
      .from("customers")
      .select("name, address, contact_name, phone, open_start, open_end")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("employees")
      .select("name, role, rating, phone, email")
      .eq("is_active", true)
      .order("name"),
  ]);

  const data: ExportData = {
    customers: customers ?? [],
    employees: employees ?? [],
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Export your data</h2>
        <p className="mb-4 text-slate-600">
          Download your customers and employees as Excel files.
        </p>
        <ExportClient data={data} companyName={company.name} />
      </section>
    </div>
  );
}
