"use client";

// "Unsent changes" detection/revert, renderer-facing. Same exported names as
// before, now backed by the Electron main process (SQLite) through the IPC bridge.

import { henry, emitDataChanged } from "@/lib/ipc/client";

export async function hasUnsentChanges(): Promise<boolean> {
  return henry().drafts.hasUnsent();
}

export async function revertUnsentChanges(): Promise<{ error?: string }> {
  const res = await henry().drafts.revert();
  if (!res.error) emitDataChanged();
  return res;
}
