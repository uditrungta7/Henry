"use client";

// Publish the whole week in ONE go: every active employee gets one individual
// email with their own shifts for the week plus the full team plan, so everyone
// knows who is where. Re-publishing after a change re-emails everyone with the
// updated week. Loads its own data for the week so it works from the day view
// or the week view.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, StatusBadge, Alert, Select } from "@/components/ui";
import { formatUsDate } from "@/lib/dates";
import {
  buildWeekSubject,
  buildWeekHtml,
  type WeekShiftLine,
  type TeamShiftLine,
} from "@/lib/email/compose";
import { henry } from "@/lib/ipc/client";
import { useData } from "@/lib/ipc/useData";
import { publishWeek, resendEmail, type RecipientResult } from "./publish";

const STATUS_LABEL: Record<RecipientResult["status"], string> = {
  sent: "Sent",
  unchanged: "Already sent",
  skipped: "Can't send",
  failed: "Failed",
};

export default function WeekPublishPanel({
  days,
  onClose,
}: {
  days: string[]; // the 7 ISO dates Sun..Sat
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preface, setPreface] = useState("");
  const [onCall, setOnCall] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewId, setPreviewId] = useState("");
  const [results, setResults] = useState<RecipientResult[] | null>(null);
  const [error, setError] = useState("");

  const first = days[0];
  const last = days[6];

  const load = useCallback(async () => {
    const company = await henry().company.get();
    const board = await henry().board.get(first, last);
    // Who was on call last time this week was published, for the prefill below.
    const lastPublish = await henry().publishes.latestForWeek(first);
    return {
      companyName: company.name,
      ...board,
      lastOnCallId: lastPublish?.on_call_employee_id ?? null,
    };
  }, [first, last]);
  const { data, error: loadError, reload } = useData(load, `board:${first}:${last}`);

  // When re-publishing an already-sent week, prefill the on-call pick with the
  // person from the last publish. Runs once per open; only if they're still an
  // active employee and not scheduled to work this week (the backup rule).
  const prefilled = useRef(false);
  useEffect(() => {
    if (!data || prefilled.current) return;
    prefilled.current = true;
    const id = data.lastOnCallId;
    if (!id) return;
    const eligible =
      data.employees.some((e: { id: string }) => e.id === id) &&
      !data.assignments.some((a: { employee_id: string }) => a.employee_id === id);
    if (eligible) setOnCall(id);
  }, [data]);

  if (results) {
    return (
      <Modal title="Week sent" onClose={onClose}>
        <ResultList results={results} />
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  if (loadError) {
    return (
      <Modal title={`Publish week of ${formatUsDate(first)}`} onClose={onClose}>
        <Alert>{loadError}</Alert>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      </Modal>
    );
  }

  if (!data) {
    return (
      <Modal title={`Publish week of ${formatUsDate(first)}`} onClose={onClose}>
        <p className="text-slate-500">Loading...</p>
      </Modal>
    );
  }

  const { companyName, customers, employees, assignments } = data;
  const custById = new Map(customers.map((c) => [c.id, c]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  if (assignments.length === 0) {
    return (
      <Modal title={`Publish week of ${formatUsDate(first)}`} onClose={onClose}>
        <p className="text-slate-600">
          Nothing is scheduled this week yet. Assign employees to sites, then
          publish.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  // On call must be someone who is NOT working this week (they're the backup).
  const workingIds = new Set(assignments.map((a) => a.employee_id));
  const teamShifts: TeamShiftLine[] = assignments.map((a) => ({
    date: a.work_date,
    shift: a.shift,
    customerName: custById.get(a.customer_id)?.name ?? "Unknown",
    employeeName: empById.get(a.employee_id)?.name ?? "Unknown",
  }));

  const onCallEmp = onCall ? empById.get(onCall) : undefined;
  const onCallForBody = onCallEmp
    ? { name: onCallEmp.name, phone: onCallEmp.phone }
    : null;

  function bodyFor(employeeId: string): string {
    const emp = empById.get(employeeId);
    const myShifts: WeekShiftLine[] = assignments
      .filter((a) => a.employee_id === employeeId)
      .map((a) => {
        const c = custById.get(a.customer_id);
        return {
          date: a.work_date,
          shift: a.shift,
          customerName: c?.name ?? "Unknown",
          address: c?.address ?? null,
          notes: a.notes,
        };
      });
    return buildWeekHtml({
      companyName,
      weekStartIso: first,
      preface: preface.trim() || null,
      employeeName: emp?.name,
      myShifts,
      teamShifts,
      onCall: onCallForBody,
    });
  }

  function send() {
    setError("");
    startTransition(async () => {
      const res = await publishWeek(days, preface.trim() || null, onCall || null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResults(res.results ?? []);
      router.refresh();
    });
  }

  const previewEmp = empById.get(previewId) ?? employees[0];

  return (
    <Modal title={`Publish week of ${formatUsDate(first)}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-slate-600">
          Every employee gets one email with their own week and the full team
          plan, so everyone knows who is where. All {employees.length} active
          employees will be emailed.
        </p>

        <Field label="Message at the top (optional)">
          <textarea
            value={preface}
            onChange={(e) => setPreface(e.target.value)}
            rows={3}
            placeholder="e.g. Reminder: new gate code is 4321 all week."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>

        <Field label="On call this week (optional)">
          <Select value={onCall} onChange={(e) => setOnCall(e.target.value)}>
            <option value="">No one on call</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id} disabled={workingIds.has(e.id)}>
                {e.name}
                {workingIds.has(e.id) ? " (working this week)" : ""}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            The on-call person is the backup, so it can&apos;t be someone who is
            already working this week.
          </p>
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            {showPreview ? "Hide preview" : "Preview the email"}
          </button>
          {showPreview && previewEmp && (
            <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">
                Subject: {buildWeekSubject(first)}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600">Preview for:</span>
                <select
                  value={previewEmp.id}
                  onChange={(e) => setPreviewId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2"
                // Our own generated markup (all user values HTML-escaped in
                // buildWeekHtml), shown exactly as mail clients will render it.
                dangerouslySetInnerHTML={{ __html: bodyFor(previewEmp.id) }}
              />
            </div>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending}>
            {pending ? "Sending..." : "Send to everyone"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ResultList({ results: initial }: { results: RecipientResult[] }) {
  // Own the rows locally so a resend updates its row's status in place the
  // instant the send returns, no full-page refresh to wait on.
  const [results, setResults] = useState<RecipientResult[]>(initial);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const count = (s: RecipientResult["status"]) =>
    results.filter((r) => r.status === s).length;

  async function resend(row: RecipientResult) {
    if (!row.emailId) return;
    setResendingId(row.emailId);
    const res = await resendEmail(row.emailId!);
    setResults((rows) =>
      rows.map((r) =>
        r.emailId === row.emailId
          ? res.error
            ? { ...r, status: "failed", detail: res.error }
            : { ...r, status: "sent", detail: "Resent", emailId: undefined }
          : r
      )
    );
    setResendingId(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-slate-700">
        Sent {count("sent")}
        {count("unchanged") > 0 && `, ${count("unchanged")} already sent`}
        {count("skipped") > 0 && `, ${count("skipped")} couldn't send`}
        {count("failed") > 0 && `, ${count("failed")} failed`}.
      </p>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {results.map((r) => (
          <li
            key={`${r.kind ?? "employee"}-${r.employeeId}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-800">{r.name}</span>
                {r.kind === "customer" && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    customer
                  </span>
                )}
              </span>
              {(r.detail || r.email) && (
                <span className="block truncate text-xs text-slate-500">
                  {r.detail ?? r.email}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {r.status === "failed" && r.emailId && (
                <Button
                  variant="secondary"
                  disabled={resendingId === r.emailId}
                  onClick={() => resend(r)}
                >
                  {resendingId === r.emailId ? "Sending..." : "Resend"}
                </Button>
              )}
              <StatusBadge tone={r.status}>{STATUS_LABEL[r.status]}</StatusBadge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
