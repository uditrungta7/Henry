"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSubject, buildBody, type ShiftLine } from "@/lib/email/compose";
import { sendPlainTextEmail } from "@/lib/email/send";

export type RecipientResult = {
  employeeId: string;
  name: string;
  email: string | null;
  status: "sent" | "failed" | "skipped" | "unchanged";
  detail?: string;
  emailId?: string; // set on failed rows so the UI can offer a one-click resend
};

export type PublishResult = {
  error?: string;
  results?: RecipientResult[];
};

// Resolve the caller's company through RLS (the user's session), so we never
// trust a client-supplied company id. The actual send + writes use the admin
// client (service role) but are ALWAYS scoped to this company_id explicitly.
async function resolveCompany() {
  const supabase = createClient();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("company_id")
    .single();
  if (!appUser) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .single();
  return company ? { id: company.id as string, name: company.name as string } : null;
}

export async function publishDay(
  dateIso: string,
  preface: string | null,
  onCallEmployeeId: string | null
): Promise<PublishResult> {
  const company = await resolveCompany();
  if (!company) return { error: "No company found." };

  const admin = createAdminClient();
  const companyId = company.id;

  // --- Gather the day's assignments (scoped to company) ---
  const { data: assignments } = await admin
    .from("assignments")
    .select("id, customer_id, employee_id, shift, notes")
    .eq("company_id", companyId)
    .eq("work_date", dateIso);

  if (!assignments || assignments.length === 0) {
    return { error: "Nothing is scheduled for this day yet." };
  }

  // Employees and customers we need, scoped to company.
  const employeeIds = [...new Set(assignments.map((a) => a.employee_id))];
  const customerIds = [...new Set(assignments.map((a) => a.customer_id))];

  const [{ data: employees }, { data: customers }] = await Promise.all([
    admin
      .from("employees")
      .select("id, name, email, phone")
      .eq("company_id", companyId)
      .in("id", employeeIds),
    admin
      .from("customers")
      .select("id, name, address")
      .eq("company_id", companyId)
      .in("id", customerIds),
  ]);

  const empById = new Map((employees ?? []).map((e) => [e.id, e]));
  const custById = new Map((customers ?? []).map((c) => [c.id, c]));

  // On-call line goes in every email; the on-call person also gets their own.
  let onCall: { name: string; phone: string | null } | null = null;
  let onCallEmp: { id: string; name: string; email: string | null } | null = null;
  if (onCallEmployeeId) {
    const { data } = await admin
      .from("employees")
      .select("id, name, email, phone")
      .eq("company_id", companyId)
      .eq("id", onCallEmployeeId)
      .single();
    if (data) {
      onCall = { name: data.name, phone: data.phone };
      onCallEmp = { id: data.id, name: data.name, email: data.email };
    }
  }

  // --- What did we last send each employee for THIS day? (smart re-publish) ---
  // Subject encodes the date, so matching on subject scopes to this day.
  const subject = buildSubject(dateIso);
  const { data: lastEmails } = await admin
    .from("emails")
    .select("employee_id, body, status, created_at")
    .eq("company_id", companyId)
    .eq("subject", subject)
    .eq("status", "sent")
    .order("created_at", { ascending: false });
  const lastBodyByEmployee = new Map<string, string>();
  for (const e of lastEmails ?? []) {
    if (e.employee_id && !lastBodyByEmployee.has(e.employee_id)) {
      lastBodyByEmployee.set(e.employee_id, e.body ?? "");
    }
  }

  // --- Build each recipient's email ---
  const recipientIds = new Set(employeeIds);
  if (onCallEmp) recipientIds.add(onCallEmp.id); // on-call gets their own email too

  // Record the publish first so emails can reference it.
  const { data: publishRow, error: pErr } = await admin
    .from("publishes")
    .insert({
      company_id: companyId,
      work_date: dateIso,
      preface_message: preface?.trim() || null,
      recipient_count: 0, // updated after we know how many we sent
    })
    .select()
    .single();
  if (pErr || !publishRow) {
    return { error: pErr?.message ?? "Could not record the publish." };
  }

  const results: RecipientResult[] = [];
  let sentCount = 0;

  for (const employeeId of recipientIds) {
    const emp = empById.get(employeeId) ?? onCallEmp;
    if (!emp) continue;

    const shifts: ShiftLine[] = assignments
      .filter((a) => a.employee_id === employeeId)
      .map((a) => {
        const cust = custById.get(a.customer_id);
        return {
          shift: a.shift as "AM" | "PM",
          customerName: cust?.name ?? "Unknown",
          address: cust?.address ?? null,
          notes: a.notes,
        };
      });

    const body = buildBody({
      companyName: company.name,
      dateIso,
      preface,
      shifts,
      onCall,
    });

    // Skip employees with no email; warn the boss.
    if (!emp.email) {
      results.push({
        employeeId,
        name: emp.name,
        email: null,
        status: "skipped",
        detail: "No email on file",
      });
      continue;
    }

    // Smart re-publish: skip if the body is identical to what we last sent.
    if (lastBodyByEmployee.get(employeeId) === body) {
      results.push({
        employeeId,
        name: emp.name,
        email: emp.email,
        status: "unchanged",
      });
      continue;
    }

    const sendRes = await sendPlainTextEmail({
      to: emp.email,
      subject,
      text: body,
      fromName: company.name,
    });

    const { data: emailRow } = await admin
      .from("emails")
      .insert({
        company_id: companyId,
        publish_id: publishRow.id,
        employee_id: employeeId,
        to_email: emp.email,
        subject,
        body,
        status: sendRes.ok ? "sent" : "failed",
        provider_message_id: sendRes.ok ? sendRes.providerMessageId : null,
        error: sendRes.ok ? null : sendRes.error,
      })
      .select("id")
      .single();

    if (sendRes.ok) {
      sentCount++;
      results.push({
        employeeId,
        name: emp.name,
        email: emp.email,
        status: "sent",
      });
    } else {
      results.push({
        employeeId,
        name: emp.name,
        email: emp.email,
        status: "failed",
        detail: sendRes.error,
        emailId: emailRow?.id,
      });
    }
  }

  // Flip this day's assignments to published.
  await admin
    .from("assignments")
    .update({ status: "published" })
    .eq("company_id", companyId)
    .eq("work_date", dateIso);

  await admin
    .from("publishes")
    .update({ recipient_count: sentCount })
    .eq("id", publishRow.id);

  revalidatePath("/");
  return { results };
}

// Resend a single failed email by its emails-row id (one-click resend).
export async function resendEmail(emailId: string): Promise<{ error?: string }> {
  const company = await resolveCompany();
  if (!company) return { error: "No company found." };
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("emails")
    .select("id, to_email, subject, body")
    .eq("company_id", company.id)
    .eq("id", emailId)
    .single();
  if (!row || !row.to_email) return { error: "That email can't be resent." };

  const sendRes = await sendPlainTextEmail({
    to: row.to_email,
    subject: row.subject ?? "",
    text: row.body ?? "",
    fromName: company.name,
  });

  await admin
    .from("emails")
    .update({
      status: sendRes.ok ? "sent" : "failed",
      provider_message_id: sendRes.ok ? sendRes.providerMessageId : null,
      error: sendRes.ok ? null : sendRes.error,
    })
    .eq("company_id", company.id)
    .eq("id", emailId);

  revalidatePath("/");
  return sendRes.ok ? {} : { error: sendRes.error };
}
