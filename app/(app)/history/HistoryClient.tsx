"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusBadge } from "@/components/ui";
import { formatDayLabel } from "@/lib/dates";
import { resendEmail } from "../schedule/publish";

export type EmailRecord = {
  id: string;
  to_email: string | null;
  status: "queued" | "sent" | "failed";
  error: string | null;
  employee: { name: string } | null;
};

export type PublishRecord = {
  id: string;
  work_date: string;
  preface_message: string | null;
  recipient_count: number | null;
  published_at: string;
  emails: EmailRecord[];
};

export default function HistoryClient({
  publishes,
}: {
  publishes: PublishRecord[];
}) {
  if (publishes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Publish history</h1>
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-lg font-medium">Nothing published yet</p>
          <p className="mt-1 text-slate-500">
            When you publish a day&apos;s schedule, it will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Publish history</h1>
      <div className="space-y-3">
        {publishes.map((p) => (
          <PublishRow key={p.id} publish={p} />
        ))}
      </div>
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
          <div className="font-semibold">{formatDayLabel(publish.work_date)}</div>
          <div className="text-sm text-slate-500">
            {publish.recipient_count ?? 0} sent
            {failedCount > 0 && (
              <span className="text-red-600"> · {failedCount} failed</span>
            )}
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span>
        {email.employee?.name ?? email.to_email ?? "Unknown"}
        {email.status === "failed" && email.error && (
          <span className="text-sm text-slate-500"> — {email.error}</span>
        )}
      </span>
      <span className="flex items-center gap-2">
        {email.to_email && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await resendEmail(email.id);
                router.refresh();
              })
            }
          >
            {email.status === "failed" ? "Resend" : "Send again"}
          </Button>
        )}
        <StatusBadge tone={email.status}>
          {{ sent: "Sent", failed: "Failed", queued: "Queued" }[email.status]}
        </StatusBadge>
      </span>
    </li>
  );
}
