import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireLicensedCompany } from "@/lib/auth/company";
import { nextUnusedColor } from "@/lib/colors";
import type { CustomerRecord, EmployeeRecord } from "@/lib/import/schema";

// Upserts parsed customer/employee records into the logged-in user's company.
// Uses the RLS-enforced session client, so rows can only ever land in that
// company. Matching: customers on lower(name); employees on lower(name)+email.
// Blank incoming fields never overwrite an existing non-blank value.

type Body = {
  customers: CustomerRecord[];
  employees: EmployeeRecord[];
};

// Keep an existing value when the incoming field is blank (null/empty).
function preferIncoming<T>(incoming: T | null, existing: T | null): T | null {
  return incoming === null || incoming === "" ? existing : incoming;
}

export async function POST(request: Request) {
  // Auth + company + license in one gate (blocks expired-trial companies too).
  const gate = await requireLicensedCompany();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: 403 });
  }
  const companyId = gate.companyId;
  const supabase = createClient();

  const body = (await request.json()) as Body;

  let customersAdded = 0;
  let customersUpdated = 0;
  let employeesAdded = 0;
  let employeesUpdated = 0;

  // ---- Customers: match on lower(name) within the company ----
  const { data: existingCustomers } = await supabase
    .from("customers")
    .select("id, name, contact_name, phone, address, open_start, open_end, color");
  const customerByName = new Map(
    (existingCustomers ?? []).map((c) => [c.name.trim().toLowerCase(), c])
  );
  // Track colors in use so new customers each get a distinct one.
  const customerColors = (existingCustomers ?? []).map((c) => c.color);

  for (const rec of body.customers) {
    if (!rec.name.trim()) continue;
    const key = rec.name.trim().toLowerCase();
    const existing = customerByName.get(key);

    if (existing) {
      const { error } = await supabase
        .from("customers")
        .update({
          contact_name: preferIncoming(rec.contact_name, existing.contact_name),
          phone: preferIncoming(rec.phone, existing.phone),
          address: preferIncoming(rec.address, existing.address),
          open_start: preferIncoming(rec.open_start, existing.open_start),
          open_end: preferIncoming(rec.open_end, existing.open_end),
          // Only apply a spreadsheet color when present; keep existing otherwise.
          color: rec.color ?? existing.color,
        })
        .eq("id", existing.id);
      if (error) return fail(error.message);
      customersUpdated++;
    } else {
      // Use the spreadsheet color if matched, else the next distinct color.
      const color = rec.color ?? nextUnusedColor(customerColors);
      customerColors.push(color);
      const { error } = await supabase.from("customers").insert({
        company_id: companyId,
        name: rec.name.trim(),
        contact_name: rec.contact_name,
        phone: rec.phone,
        address: rec.address,
        open_start: rec.open_start,
        open_end: rec.open_end,
        color,
      });
      if (error) return fail(error.message);
      customersAdded++;
    }
  }

  // ---- Employees: match on lower(name) + email within the company ----
  const { data: existingEmployees } = await supabase
    .from("employees")
    .select("id, name, email, role, rating, phone, eid, city, state, color");
  const employeeKey = (name: string, email: string | null) =>
    `${name.trim().toLowerCase()}|${(email ?? "").toLowerCase()}`;
  const employeeByKey = new Map(
    (existingEmployees ?? []).map((e) => [employeeKey(e.name, e.email), e])
  );
  // Track colors in use so new employees each get a distinct one.
  const employeeColors = (existingEmployees ?? []).map((e) => e.color);

  for (const rec of body.employees) {
    if (!rec.name.trim()) continue;
    const existing = employeeByKey.get(employeeKey(rec.name, rec.email));

    if (existing) {
      const { error } = await supabase
        .from("employees")
        .update({
          role: preferIncoming(rec.role, existing.role),
          rating: rec.rating ?? existing.rating,
          phone: preferIncoming(rec.phone, existing.phone),
          eid: preferIncoming(rec.eid, existing.eid),
          city: preferIncoming(rec.city, existing.city),
          state: preferIncoming(rec.state, existing.state),
        })
        .eq("id", existing.id);
      if (error) return fail(error.message);
      employeesUpdated++;
    } else {
      const color = nextUnusedColor(employeeColors);
      employeeColors.push(color);
      const { error } = await supabase.from("employees").insert({
        company_id: companyId,
        name: rec.name.trim(),
        role: rec.role,
        rating: rec.rating,
        phone: rec.phone,
        email: rec.email,
        eid: rec.eid,
        city: rec.city,
        state: rec.state,
        color,
      });
      if (error) return fail(error.message);
      employeesAdded++;
    }
  }

  return NextResponse.json({
    customersAdded,
    customersUpdated,
    employeesAdded,
    employeesUpdated,
  });
}

function fail(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
