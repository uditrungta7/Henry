"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, StatusBadge, Alert } from "@/components/ui";
import { formatDayLabel } from "@/lib/dates";
import { buildSubject, buildBody, type ShiftLine } from "@/lib/email/compose";
import { publishDay, resendEmail, type RecipientResult } from "./publish";
import type { BoardEmployee } from "./types";

// One employee's shifts for the day, used to render an accurate email preview.
export type PreviewEmployee = {
  id: string;
  name: string;
  phone: string | null;
  shifts: ShiftLine[];
};

// Plain-language labels for the non-technical owner.
const STATUS_LABEL: Record<RecipientResult["status"], string> = {
  sent: "Sent",
  unchanged: "Already sent",
  skipped: "Can't send",
  failed: "Failed",
};

export default function PublishPanel({
  date,
  companyName,
  assignedEmployees,
  allEmployees,
  previewEmployees,
  onClose,
}: {
  date: string;
  companyName: string;
  assignedEmployees: BoardEmployee[];
  allEmployees: BoardEmployee[];
  previewEmployees: PreviewEmployee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preface, setPreface] = useState("");
  const [onCall, setOnCall] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [results, setResults] = useState<RecipientResult[] | null>(null);
  const [error, setError] = useState("");

  function send() {
    setError("");
    startTransition(async () => {
      const res = await publishDay(date, preface.trim() || null, onCall || null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResults(res.results ?? []);
      router.refresh();
    });
  }

  if (results) {
    return (
      <Modal title="Schedule sent" onClose={onClose}>
        <ResultList results={results} />
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  // Build an accurate preview for the first assigned employee (what they'll get).
  const sample = previewEmployees[0];
  const onCallEmp = onCall ? allEmployees.find((e) => e.id === onCall) : null;
  const previewBody = sample
    ? buildBody({
        companyName,
        dateIso: date,
        preface: preface.trim() || null,
        shifts: sample.shifts,
        onCall: onCallEmp
          ? {
              name: onCallEmp.name,
              phone: previewEmployees.find((p) => p.id === onCall)?.phone ?? null,
            }
          : null,
      })
    : "";

  return (
    <Modal title={`Publish ${formatDayLabel(date)}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-slate-600">
          Each assigned employee gets a plain-text email with their shifts for
          the day. {assignedEmployees.length} will be emailed.
        </p>

        <Field label="Message at the top (optional)">
          <textarea
            value={preface}
            onChange={(e) => setPreface(e.target.value)}
            rows={3}
            placeholder="e.g. Thanks everyone — gate code changed to 4321."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </Field>

        <Field label="On call (optional)">
          <select
            value={onCall}
            onChange={(e) => setOnCall(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <option value="">No one on call</option>
            {assignedEmployees.length > 0 && (
              <optgroup label="Working today">
                {assignedEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Everyone">
              {allEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>

        {sample && (
          <div>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              {showPreview ? "Hide preview" : "Preview the email"}
            </button>
            {showPreview && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 text-xs text-slate-500">
                  Example — what {sample.name} will receive:
                </div>
                <div className="text-xs text-slate-500">
                  Subject: {buildSubject(date)}
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-slate-800">
                  {previewBody}
                </pre>
              </div>
            )}
          </div>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={pending}>
            {pending ? "Sending…" : "Send schedule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ResultList({ results }: { results: RecipientResult[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const count = (s: RecipientResult["status"]) =>
    results.filter((r) => r.status === s).length;

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
            className="flex items-center justify-between gap-2 px-3 py-2"
          >
            <span>
              {r.name}
              {r.kind === "customer" && (
                <span className="ml-1 text-xs text-slate-400">(customer)</span>
              )}
              {r.detail && <span className="text-slate-500"> — {r.detail}</span>}
            </span>
            <span className="flex items-center gap-2">
              {r.status === "failed" && r.emailId && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await resendEmail(r.emailId!);
                      router.refresh();
                    })
                  }
                >
                  Resend
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
