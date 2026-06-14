"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field } from "@/components/ui";
import { formatDayLabel } from "@/lib/dates";
import { publishDay, resendEmail, type RecipientResult } from "./publish";
import type { BoardEmployee } from "./types";

// Employees actually assigned that day — the natural on-call candidates,
// plus the full active list so the boss can pick anyone.
export default function PublishPanel({
  date,
  assignedEmployees,
  allEmployees,
  onClose,
}: {
  date: string;
  assignedEmployees: BoardEmployee[];
  allEmployees: BoardEmployee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preface, setPreface] = useState("");
  const [onCall, setOnCall] = useState("");
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

  return (
    <Modal title={`Publish ${formatDayLabel(date)}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-slate-600">
          Each assigned employee gets a plain-text email with their shifts for
          the day.
        </p>

        <Field label="Message at the top (optional)">
          <textarea
            value={preface}
            onChange={(e) => setPreface(e.target.value)}
            rows={3}
            placeholder="e.g. Thanks everyone — gate code changed to 4321."
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label="On call (optional)">
          <select
            value={onCall}
            onChange={(e) => setOnCall(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
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

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        )}

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

  const sent = results.filter((r) => r.status === "sent");
  const unchanged = results.filter((r) => r.status === "unchanged");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");

  return (
    <div className="space-y-3">
      <p className="text-slate-700">
        Sent {sent.length}
        {unchanged.length > 0 && `, ${unchanged.length} unchanged`}
        {skipped.length > 0 && `, ${skipped.length} skipped`}
        {failed.length > 0 && `, ${failed.length} failed`}.
      </p>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {results.map((r) => (
          <li
            key={r.employeeId}
            className="flex items-center justify-between gap-2 px-3 py-2"
          >
            <span>
              {r.name}
              {r.detail && (
                <span className="text-slate-500"> — {r.detail}</span>
              )}
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
              <StatusBadge status={r.status} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: RecipientResult["status"] }) {
  const map = {
    sent: "bg-green-100 text-green-800",
    unchanged: "bg-slate-100 text-slate-600",
    skipped: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-800",
  }[status];
  const label = {
    sent: "Sent",
    unchanged: "No change",
    skipped: "Skipped",
    failed: "Failed",
  }[status];
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map}`}>
      {label}
    </span>
  );
}
