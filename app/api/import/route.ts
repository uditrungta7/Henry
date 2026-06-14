import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // company_id from the user's mapping (read through RLS).
  const { data: appUser } = await supabase
    .from("app_users")
    .select("company_id")
    .single();
  if (!appUser) {
    return NextResponse.json({ error: "No company found." }, { status: 403 });
  }
  const companyId = appUser.company_id as string;

  const body = (await request.json()) as Body;

  let customersAdded = 0;
  let customersUpdated = 0;
  let employeesAdded = 0;
  let employeesUpdated = 0;

  // ---- Customers: match on lower(name) within the company ----
  const { data: existingCustomers } = await supabase
    .from("customers")
    .select("id, name, contact_name, phone, address, open_start, open_end");
  const customerByName = new Map(
    (existingCustomers ?? []).map((c) => [c.name.trim().toLowerCase(), c])
  );

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
        })
        .eq("id", existing.id);
      if (error) return fail(error.message);
      customersUpdated++;
    } else {
      const { error } = await supabase.from("customers").insert({
        company_id: companyId,
        name: rec.name.trim(),
        contact_name: rec.contact_name,
        phone: rec.phone,
        address: rec.address,
        open_start: rec.open_start,
        open_end: rec.open_end,
      });
      if (error) return fail(error.message);
      customersAdded++;
    }
  }

  // ---- Employees: match on lower(name) + email within the company ----
  const { data: existingEmployees } = await supabase
    .from("employees")
    .select("id, name, email, role, rating, phone");
  const employeeKey = (name: string, email: string | null) =>
    `${name.trim().toLowerCase()}|${(email ?? "").toLowerCase()}`;
  const employeeByKey = new Map(
    (existingEmployees ?? []).map((e) => [employeeKey(e.name, e.email), e])
  );

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
        })
        .eq("id", existing.id);
      if (error) return fail(error.message);
      employeesUpdated++;
    } else {
      const { error } = await supabase.from("employees").insert({
        company_id: companyId,
        name: rec.name.trim(),
        role: rec.role,
        rating: rec.rating,
        phone: rec.phone,
        email: rec.email,
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
