"use client";

// Customer mutations. Same exported names/signatures as before, now backed by the
// local SQLite database through the Electron IPC bridge instead of Supabase.
// Single tenant, no company scoping. Each successful write emits a data-changed
// event so the Customers page re-fetches.

import { henry, emitDataChanged } from "@/lib/ipc/client";

export type CustomerInput = {
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  open_start: string | null;
  open_end: string | null;
  color: string;
  notes: string | null;
  notify_email: boolean;
};

export async function saveCustomer(
  id: string | null,
  input: CustomerInput
): Promise<{ error?: string }> {
  const res = await henry().customers.save(id, input);
  if (!res.error) emitDataChanged();
  return res;
}

export async function setCustomerActive(id: string, isActive: boolean) {
  const res = await henry().customers.setActive(id, isActive);
  if (!res.error) emitDataChanged();
  return res;
}
