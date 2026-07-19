// "Unsent changes" = edits to an already-published day that haven't been
// re-published. Detected/reverted by comparing each published day's live
// assignments against its snapshot (written at publish time). Days never
// published have no snapshot and are never touched. Mirrors the old drafts.ts.

import { randomUUID } from "node:crypto";
import { getDatabase } from "./db";

type Row = {
  work_date: string;
  customer_id: string;
  employee_id: string;
  shift: string;
  notes: string | null;
};

const key = (r: Row) =>
  `${r.customer_id}|${r.employee_id}|${r.shift}|${r.notes ?? ""}`;

function sameSet(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  const bKeys = new Set(b.map(key));
  return a.every((r) => bKeys.has(key(r)));
}

function groupByDay(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const list = m.get(r.work_date) ?? [];
    list.push(r);
    m.set(r.work_date, list);
  }
  return m;
}

export function hasUnsentChanges(): boolean {
  return unsentDates().length > 0;
}

// The published dates whose live assignments no longer match what was sent.
// The board uses these to point the owner at the week(s) that need re-publishing.
export function unsentDates(): string[] {
  const db = getDatabase();
  const snaps = db
    .prepare(
      "select work_date, customer_id, employee_id, shift, notes from assignment_snapshots"
    )
    .all() as Row[];
  if (snaps.length === 0) return [];

  const snapByDay = groupByDay(snaps);
  const dates = [...snapByDay.keys()];
  const live = db
    .prepare(
      `select work_date, customer_id, employee_id, shift, notes from assignments ` +
        `where work_date in (${dates.map(() => "?").join(",")})`
    )
    .all(...dates) as Row[];
  const liveByDay = groupByDay(live);

  const changed: string[] = [];
  for (const [date, snapRows] of snapByDay) {
    if (!sameSet(snapRows, liveByDay.get(date) ?? [])) changed.push(date);
  }
  return changed.sort();
}

export function revertUnsentChanges(): { error?: string } {
  const db = getDatabase();
  const snaps = db
    .prepare(
      "select work_date, customer_id, employee_id, shift, notes from assignment_snapshots"
    )
    .all() as Row[];
  if (snaps.length === 0) return {};

  const snapByDay = groupByDay(snaps);
  const del = db.prepare("delete from assignments where work_date=?");
  const ins = db.prepare(
    "insert into assignments (id, customer_id, employee_id, work_date, shift, notes, status) " +
      "values (?, ?, ?, ?, ?, ?, 'published')"
  );
  const restore = db.transaction(() => {
    for (const [date, rows] of snapByDay) {
      del.run(date);
      for (const r of rows) {
        ins.run(randomUUID(), r.customer_id, r.employee_id, date, r.shift, r.notes);
      }
    }
  });
  restore();
  return {};
}
