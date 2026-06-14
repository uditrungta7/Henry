import { createClient } from "@/lib/supabase/server";

// Phase 1 landing page. Its job for now is to PROVE tenant isolation: it reads
// customers and employees through the RLS-enforced session client, so it can only
// ever show rows belonging to the logged-in user's company. The real scheduling
// board replaces this in phase 4.
export default async function SchedulePage() {
  const supabase = createClient();

  const [{ data: customers }, { data: employees }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("employees")
      .select("id, name, email")
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Schedule</h1>
        <p className="text-slate-600">
          The scheduling board lands here. For now, this confirms you only see
          your own company&apos;s data.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-xl font-semibold">
          Your customers ({customers?.length ?? 0})
        </h2>
        {customers && customers.length > 0 ? (
          <ul className="list-inside list-disc text-slate-700">
            {customers.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">
            No customers yet. Import your spreadsheet or add them by hand.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">
          Your employees ({employees?.length ?? 0})
        </h2>
        {employees && employees.length > 0 ? (
          <ul className="list-inside list-disc text-slate-700">
            {employees.map((e) => (
              <li key={e.id}>
                {e.name}
                {e.email ? ` — ${e.email}` : " — (no email)"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500">No employees yet.</p>
        )}
      </section>
    </div>
  );
}
