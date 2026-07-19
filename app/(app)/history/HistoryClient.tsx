"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Button, StatusBadge } from "@/components/ui";
import { formatDayLabel, formatUsDate } from "@/lib/dates";
import { resendEmail } from "../schedule/publish";
import { henry } from "@/lib/ipc/client";

export type EmailRecord = {
  id: string;
  to_email: string | null;
  status: "queued" | "sent" | "failed";
  error: string | null;
  employee: { name: string } | null;
};

export type PublishShift = {
  date: string;
  shift: string;
  customer: string;
  address: string | null;
  employee: string;
};

export type PublishRecord = {
  id: string;
  work_date: string;
  preface_message: string | null;
  recipient_count: number | null;
  on_call_name: string | null;
  published_at: string;
  emails: EmailRecord[];
  shifts: PublishShift[];
};

export default function HistoryClient({
  publishes,
  months,
}: {
  publishes: PublishRecord[];
  months: string[];
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Publish history</h1>
        {months.length > 0 && <MonthExport months={months} />}
      </header>

      {publishes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-lg font-medium">Nothing published yet</p>
          <p className="mt-1 text-slate-500">
            When you publish a week&apos;s schedule, it will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {publishes.map((p) => (
            <PublishRow key={p.id} publish={p} />
          ))}
        </div>
      )}
    </div>
  );
}

// Month label e.g. "2026-06" -> "June 2026".
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Export every published shift in a chosen month to Excel, so the boss can tally
// shift-based pay. One row per shift: employee, date, shift, customer, address.
function MonthExport({ months }: { months: string[] }) {
  const [month, setMonth] = useState(months[0]);
  const [busy, setBusy] = useState(false);

  async function exportMonth() {
    setBusy(true);
    try {
      const { rows } = await henry().publishes.exportMonth(month);
      const sheet = rows.map((r) => ({
        Employee: r.employee,
        Date: formatUsDate(r.date),
        Shift: r.shift,
        Customer: r.customer,
        Address: r.address,
      }));
      const ws = XLSX.utils.json_to_sheet(
        sheet.length ? sheet : [{ Employee: "", Date: "", Shift: "", Customer: "", Address: "" }]
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shifts");
      XLSX.writeFile(wb, `henry-shifts-${month}.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <Button variant="secondary" disabled={busy} onClick={exportMonth}>
        {busy ? "Exporting..." : "Export month shifts"}
      </Button>
    </div>
  );
}

function PublishRow({ publish }: { publish: PublishRecord }) {
  const [open, setOpen] = useState(false);
  const failedCount = publish.emails.filter((e) => e.status === "failed").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="font-semibold">Week of {formatUsDate(publish.work_date)}</div>
          <div className="text-sm text-slate-500">
            {publish.recipient_count ?? 0} sent
            {failedCount > 0 && (
              <span className="text-red-600"> · {failedCount} failed</span>
            )}
            {publish.on_call_name && ` · on call: ${publish.on_call_name}`}
            {publish.preface_message && " · has a note"}
          </div>
        </div>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {publish.preface_message && (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
              {publish.preface_message}
            </p>
          )}

          {/* Who worked where, which day and shift, the published week. */}
          {publish.shifts.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-1 text-sm font-medium text-slate-500">Shifts</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {publish.shifts.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-32 shrink-0 text-slate-500">
                      {formatDayLabel(s.date)}
                    </span>
                    <span className="w-10 shrink-0 font-medium text-slate-500">
                      {s.shift}
                    </span>
                    <span className="font-medium">{s.employee}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-700">{s.customer}</span>
                    {s.address && (
                      <span className="truncate text-slate-400">· {s.address}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="mb-1 text-sm font-medium text-slate-500">Emails</h3>
          {publish.emails.length === 0 ? (
            <p className="text-slate-500">No emails recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {publish.emails.map((e) => (
                <EmailRow key={e.id} email={e} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EmailRow({ email }: { email: EmailRecord }) {
  const [sending, setSending] = useState(false);
  // Track status locally so the row updates the instant the send returns,
  // without waiting on a full-page re-fetch.
  const [status, setStatus] = useState(email.status);
  const [error, setError] = useState(email.error);

  async function resend() {
    setSending(true);
    const res = await resendEmail(email.id);
    setStatus(res.error ? "failed" : "sent");
    setError(res.error ?? null);
    setSending(false);
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span>
        {email.employee?.name ?? email.to_email ?? "Unknown"}
        {status === "failed" && error && (
          <span className="text-sm text-slate-500">: {error}</span>
        )}
      </span>
      <span className="flex items-center gap-2">
        {email.to_email && (
          <Button variant="secondary" disabled={sending} onClick={resend}>
            {sending
              ? "Sending..."
              : status === "failed"
                ? "Resend"
                : "Send again"}
          </Button>
        )}
        <StatusBadge tone={status}>
          {{ sent: "Sent", failed: "Failed", queued: "Queued" }[status]}
        </StatusBadge>
      </span>
    </li>
  );
}
