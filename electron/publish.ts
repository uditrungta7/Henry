// Publish a WEEK's schedule in one go: every active employee gets one individual
// plain-text email with their own shifts for the week plus the full team plan
// (so everyone knows who is where). Sent via the customer's SMTP over ONE pooled
// connection; records publishes/emails rows, snapshots each day (for "unsent
// changes" revert), and supports smart re-publish (skip a recipient whose email
// would be byte-identical AND go to the same address) + one-click resend. Because
// every email embeds the whole week, any change to the schedule changes everyone's
// email, so re-publishing after an edit re-emails the whole team. Single tenant.

import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";
import { getCompany } from "./db/queries";
import {
  buildWeekSubject,
  buildWeekBody,
  buildWeekHtml,
  buildCustomerWeekSubject,
  buildCustomerWeekBody,
  type WeekShiftLine,
  type TeamShiftLine,
  type CustomerVisitLine,
} from "./email/compose";
import { sendPlainTextEmail, openMailer } from "./email/send";

export type RecipientResult = {
  employeeId: string;
  name: string;
  email: string | null;
  status: "sent" | "failed" | "skipped" | "unchanged";
  detail?: string;
  emailId?: string;
  kind?: "employee" | "customer";
};

export type PublishResult = { error?: string; results?: RecipientResult[] };

type AssignmentRow = {
  id: string;
  customer_id: string;
  employee_id: string;
  work_date: string;
  shift: "AM" | "PM";
  notes: string | null;
};

export async function publishWeek(
  days: string[], // the 7 ISO dates Sun..Sat of the week
  preface: string | null,
  onCallEmployeeId: string | null
): Promise<PublishResult> {
  if (!Array.isArray(days) || days.length !== 7) {
    return { error: "A full week is needed to publish." };
  }
  const first = days[0];
  const last = days[6];
  const db = getDatabase();
  const company = getCompany();

  const assignments = db
    .prepare(
      "select id, customer_id, employee_id, work_date, shift, notes from assignments " +
        "where work_date >= ? and work_date <= ?"
    )
    .all(first, last) as AssignmentRow[];
  if (assignments.length === 0) {
    return { error: "Nothing is scheduled this week yet." };
  }

  // Everyone active gets the week email, assigned or not, so the whole team
  // knows who is where. Name order matches the rest of the app.
  const activeEmployees = db
    .prepare(
      "select id, name, email, phone from employees where is_active=1 order by name"
    )
    .all() as { id: string; name: string; email: string | null; phone: string | null }[];

  // Names for the team section may include archived employees still assigned.
  const assignedIds = [...new Set(assignments.map((a) => a.employee_id))];
  const nameById = new Map(activeEmployees.map((e) => [e.id, e.name]));
  if (assignedIds.length > 0) {
    const extra = db
      .prepare(
        `select id, name from employees where id in (${assignedIds.map(() => "?").join(",")})`
      )
      .all(...assignedIds) as { id: string; name: string }[];
    for (const e of extra) if (!nameById.has(e.id)) nameById.set(e.id, e.name);
  }

  const customerIds = [...new Set(assignments.map((a) => a.customer_id))];
  const custById = new Map(
    (db
      .prepare(
        `select id, name, address, email, notify_email from customers where id in (${customerIds.map(() => "?").join(",")})`
      )
      .all(...customerIds) as {
      id: string;
      name: string;
      address: string | null;
      email: string | null;
      notify_email: number;
    }[]).map((c) => [c.id, c])
  );

  // On call: the on-call person is the backup, so they must not be scheduled to
  // work any day this week.
  let onCall: { name: string; phone: string | null } | null = null;
  if (onCallEmployeeId) {
    const data = db
      .prepare("select id, name, phone from employees where id=?")
      .get(onCallEmployeeId) as
      | { id: string; name: string; phone: string | null }
      | undefined;
    if (data) {
      if (assignments.some((a) => a.employee_id === data.id)) {
        return {
          error: `${data.name} is scheduled to work this week, so they can't be on call. Pick someone who is off, or take them off the schedule first.`,
        };
      }
      onCall = { name: data.name, phone: data.phone };
    }
  }

  // Open ONE pooled SMTP connection for the whole batch. If email isn't set up,
  // refuse now — before recording a publish or flipping the week to "sent" — so
  // the owner gets a clear "set up email first" instead of a phantom publish with
  // a screen full of failures.
  const mailer = openMailer();
  if ("error" in mailer) return { error: mailer.error };

  // Everything below can send/write, so it lives in a try whose finally always
  // releases the pooled SMTP connection, even if a DB write or send throws.
  try {
    // The "who is where" section shared by every email.
    const teamShifts: TeamShiftLine[] = assignments.map((a) => ({
      date: a.work_date,
      shift: a.shift,
      customerName: custById.get(a.customer_id)?.name ?? "Unknown",
      employeeName: nameById.get(a.employee_id) ?? "Unknown",
    }));

    // Smart re-publish: what did we last successfully send each employee for this
    // week? Compare BOTH the body AND the recipient address, so fixing an
    // employee's email (with no schedule change) re-sends to the corrected address
    // instead of being skipped as "unchanged". Order by rowid (monotonic, unique),
    // NOT created_at (1-second resolution -> ties on rapid re-publishes).
    const subject = buildWeekSubject(first);
    const lastEmails = db
      .prepare(
        "select employee_id, to_email, body from emails where subject=? and status='sent' order by rowid desc"
      )
      .all(subject) as {
      employee_id: string | null;
      to_email: string | null;
      body: string | null;
    }[];
    const lastByEmployee = new Map<string, { body: string; to_email: string | null }>();
    for (const e of lastEmails) {
      if (e.employee_id && !lastByEmployee.has(e.employee_id)) {
        lastByEmployee.set(e.employee_id, { body: e.body ?? "", to_email: e.to_email });
      }
    }

    const publishId = randomUUID();
    db.prepare(
      "insert into publishes (id, work_date, preface_message, recipient_count, on_call_employee_id) values (?, ?, ?, 0, ?)"
    ).run(publishId, first, preface?.trim() || null, onCall ? onCallEmployeeId : null);

    const results: RecipientResult[] = [];
    let sentCount = 0;

    for (const emp of activeEmployees) {
      const myShifts: WeekShiftLine[] = assignments
        .filter((a) => a.employee_id === emp.id)
        .map((a) => {
          const cust = custById.get(a.customer_id);
          return {
            date: a.work_date,
            shift: a.shift,
            customerName: cust?.name ?? "Unknown",
            address: cust?.address ?? null,
            notes: a.notes,
          };
        });

      const emailOpts = {
        companyName: company.name,
        weekStartIso: first,
        preface,
        employeeName: emp.name,
        myShifts,
        teamShifts,
        onCall,
      };
      const body = buildWeekBody(emailOpts);
      const html = buildWeekHtml(emailOpts);

      if (!emp.email) {
        results.push({
          employeeId: emp.id,
          name: emp.name,
          email: null,
          status: "skipped",
          detail: "No email on file",
        });
        continue;
      }

      // Unchanged only when the SAME body would go to the SAME address.
      const last = lastByEmployee.get(emp.id);
      if (last && last.body === body && last.to_email === emp.email) {
        results.push({ employeeId: emp.id, name: emp.name, email: emp.email, status: "unchanged" });
        continue;
      }

      const sendRes = await mailer.send({ to: emp.email, subject, text: body, html });
      const emailId = randomUUID();
      db.prepare(
        "insert into emails (id, publish_id, employee_id, to_email, subject, body, html, status, error) " +
          "values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        emailId,
        publishId,
        emp.id,
        emp.email,
        subject,
        body,
        html,
        sendRes.ok ? "sent" : "failed",
        sendRes.ok ? null : sendRes.error
      );

      if (sendRes.ok) {
        sentCount++;
        results.push({ employeeId: emp.id, name: emp.name, email: emp.email, status: "sent" });
      } else {
        results.push({
          employeeId: emp.id,
          name: emp.name,
          email: emp.email,
          status: "failed",
          detail: sendRes.error,
          emailId,
        });
      }
    }

    // Optional: email opted-in customers their site's week, only when enabled.
    // Deduped the same way as employees, so re-publishing after an unrelated edit
    // doesn't spam a customer whose own site is unchanged.
    if (company.customer_email_enabled) {
      const custSubject = buildCustomerWeekSubject(company.name, first);
      const lastCustBody = new Map<string, string>(); // to_email -> last sent body
      for (const e of db
        .prepare(
          "select to_email, body from emails where subject=? and status='sent' order by rowid desc"
        )
        .all(custSubject) as { to_email: string | null; body: string | null }[]) {
        if (e.to_email && !lastCustBody.has(e.to_email)) lastCustBody.set(e.to_email, e.body ?? "");
      }

      for (const cust of custById.values()) {
        if (!cust.notify_email) continue;
        const visits: CustomerVisitLine[] = assignments
          .filter((a) => a.customer_id === cust.id)
          .map((a) => ({
            date: a.work_date,
            shift: a.shift,
            employeeName: nameById.get(a.employee_id) ?? "Unknown",
            notes: a.notes,
          }));
        if (visits.length === 0) continue;

        if (!cust.email) {
          results.push({
            employeeId: cust.id,
            name: cust.name,
            email: null,
            status: "skipped",
            detail: "Customer has no email",
            kind: "customer",
          });
          continue;
        }

        const custBody = buildCustomerWeekBody({
          companyName: company.name,
          customerName: cust.name,
          weekStartIso: first,
          preface,
          visits,
        });

        if (lastCustBody.get(cust.email) === custBody) {
          results.push({
            employeeId: cust.id,
            name: cust.name,
            email: cust.email,
            status: "unchanged",
            kind: "customer",
          });
          continue;
        }

        const custSend = await mailer.send({
          to: cust.email,
          subject: custSubject,
          text: custBody,
        });
        const custEmailId = randomUUID();
        db.prepare(
          "insert into emails (id, publish_id, employee_id, to_email, subject, body, status, error) " +
            "values (?, ?, NULL, ?, ?, ?, ?, ?)"
        ).run(
          custEmailId,
          publishId,
          cust.email,
          custSubject,
          custBody,
          custSend.ok ? "sent" : "failed",
          custSend.ok ? null : custSend.error
        );
        results.push({
          employeeId: cust.id,
          name: cust.name,
          email: cust.email,
          status: custSend.ok ? "sent" : "failed",
          detail: custSend.ok ? "Customer notified" : custSend.error,
          emailId: custSend.ok ? undefined : custEmailId,
          kind: "customer",
        });
        if (custSend.ok) sentCount++;
      }
    }

    // Flip the week to published, update the recipient count, and snapshot every
    // day of the week (empty days too, so a cleared day stops counting as an
    // unsent change).
    db.prepare(
      "update assignments set status='published' where work_date >= ? and work_date <= ?"
    ).run(first, last);
    db.prepare("update publishes set recipient_count=? where id=?").run(sentCount, publishId);

    const snap = db.prepare(
      "insert into assignment_snapshots (id, work_date, customer_id, employee_id, shift, notes) " +
        "values (?, ?, ?, ?, ?, ?)"
    );
    const delSnap = db.prepare("delete from assignment_snapshots where work_date=?");
    const insertSnaps = db.transaction(() => {
      for (const day of days) {
        delSnap.run(day);
        for (const a of assignments.filter((x) => x.work_date === day)) {
          snap.run(randomUUID(), day, a.customer_id, a.employee_id, a.shift, a.notes);
        }
      }
    });
    insertSnaps();

    return { results };
  } finally {
    // Always release the pooled SMTP connection, on every path.
    mailer.close();
  }
}

// Resend a single recorded email by its id.
export async function resendEmail(emailId: string): Promise<{ error?: string }> {
  const db = getDatabase();
  const row = db
    .prepare("select id, to_email, subject, body, html from emails where id=?")
    .get(emailId) as
    | {
        id: string;
        to_email: string | null;
        subject: string | null;
        body: string | null;
        html: string | null;
      }
    | undefined;
  if (!row || !row.to_email) return { error: "That email can't be resent." };

  const sendRes = await sendPlainTextEmail({
    to: row.to_email,
    subject: row.subject ?? "",
    text: row.body ?? "",
    html: row.html ?? undefined,
  });
  db.prepare("update emails set status=?, error=? where id=?").run(
    sendRes.ok ? "sent" : "failed",
    sendRes.ok ? null : sendRes.error,
    emailId
  );
  return sendRes.ok ? {} : { error: sendRes.error };
}
