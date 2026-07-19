"use client";

// Publish + resend, renderer-facing. Publishing is per WEEK: one action sends
// every active employee their individual email for the whole week. Backed by
// the Electron main process (SQLite + the customer's SMTP) through the IPC
// bridge. Single tenant.

import { henry, emitDataChanged } from "@/lib/ipc/client";
import type { RecipientResult, PublishResult } from "@/lib/ipc/types";

export type { RecipientResult, PublishResult };

export async function publishWeek(
  days: string[], // the 7 ISO dates Sun..Sat of the week
  preface: string | null,
  onCallEmployeeId: string | null
): Promise<PublishResult> {
  const res = await henry().publish.week(days, preface, onCallEmployeeId);
  if (!res.error) emitDataChanged();
  return res;
}

export async function resendEmail(emailId: string): Promise<{ error?: string }> {
  const res = await henry().publish.resend(emailId);
  if (!res.error) emitDataChanged();
  return res;
}
