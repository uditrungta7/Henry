"use client";

// Employee + time-off mutations. Same exported names/signatures as before, now
// backed by local SQLite through the Electron IPC bridge. Single tenant.

import { henry, emitDataChanged } from "@/lib/ipc/client";

export type EmployeeInput = {
  name: string;
  eid: string | null;
  role: string | null;
  rating: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  color: string;
  is_on_call: boolean;
};

export async function saveEmployee(
  id: string | null,
  input: EmployeeInput
): Promise<{ error?: string }> {
  const res = await henry().employees.save(id, input);
  if (!res.error) emitDataChanged();
  return res;
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  const res = await henry().employees.setActive(id, isActive);
  if (!res.error) emitDataChanged();
  return res;
}

export async function addTimeOff(
  employeeId: string,
  start_date: string,
  end_date: string,
  reason: string | null
): Promise<{ error?: string }> {
  const res = await henry().timeOff.add(employeeId, start_date, end_date, reason);
  if (!res.error) emitDataChanged();
  return res;
}

export async function removeTimeOff(id: string) {
  const res = await henry().timeOff.remove(id);
  if (!res.error) emitDataChanged();
  return res;
}
