"use client";

// Excel import upsert, renderer-facing. Replaces the old POST /api/import route.
// Parses happen in the browser (xlsx); this hands the normalized records to the
// Electron main process, which upserts into local SQLite (match: customers on
// lower(name); employees on lower(name)+email; blank never overwrites non-blank).

import { henry, emitDataChanged } from "@/lib/ipc/client";
import type { CustomerRecord, EmployeeRecord } from "@/lib/import/schema";
import type { ImportResult } from "@/lib/ipc/types";

export async function importRecords(body: {
  customers: CustomerRecord[];
  employees: EmployeeRecord[];
}): Promise<ImportResult | { error: string }> {
  try {
    const res = await henry().importData(body);
    emitDataChanged();
    return res;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed." };
  }
}
