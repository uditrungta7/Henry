"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui";
import {
  titleCase,
  summarizeTimeOff,
  formatRange,
  isPastRange,
} from "@/lib/format";
import { nextUnusedColor } from "@/lib/colors";
import {
  saveEmployee,
  setEmployeeActive,
  addTimeOff,
  removeTimeOff,
  type EmployeeInput,
} from "./actions";

export type TimeOff = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
};

export type Employee = {
  id: string;
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
  is_active: boolean;
  time_off: TimeOff[];
};

const empty: EmployeeInput = {
  name: "",
  eid: null,
  role: null,
  rating: null,
  phone: null,
  email: null,
  city: null,
  state: null,
  color: "#16a34a",
  is_on_call: false,
};

export default function EmployeesClient({
  employees,
  today,
}: {
  employees: Employee[];
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [timeOffFor, setTimeOffFor] = useState<Employee | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => e.is_active === !showArchived)
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          (e.role ?? "").toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q)
      );
  }, [employees, query, showArchived]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Employees</h1>
        <Button onClick={() => setEditing("new")}>Add employee</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name, role, or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          archived={showArchived}
          hasQuery={query.trim().length > 0}
          onAdd={() => setEditing("new")}
        />
      ) : (
        <div className="max-h-[calc(100vh-12rem)] overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-sm text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">EID</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">City, State</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Time off</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: e.color }}
                      />
                      {e.name}
                      {e.is_on_call && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          on call
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.eid ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.role ? titleCase(e.role) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {[titleCase(e.city ?? ""), e.state ?? ""]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.email ?? (
                      <span className="text-amber-700">no email</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" onClick={() => setTimeOffFor(e)}>
                      {e.time_off.length
                        ? summarizeTimeOff(e.time_off, today)
                        : "Add"}
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setEditing(e)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={async () => {
                          setPending(true);
                          await setEmployeeActive(e.id, !e.is_active);
                          setPending(false);
                        }}
                      >
                        {e.is_active ? "Archive" : "Unarchive"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EmployeeForm
          initial={editing === "new" ? null : editing}
          defaultColor={nextUnusedColor(employees.map((e) => e.color))}
          onClose={() => setEditing(null)}
        />
      )}
      {timeOffFor && (
        <TimeOffModal
          employee={timeOffFor}
          today={today}
          onClose={() => setTimeOffFor(null)}
        />
      )}
    </div>
  );
}

function EmptyState({
  archived,
  hasQuery,
  onAdd,
}: {
  archived: boolean;
  hasQuery: boolean;
  onAdd: () => void;
}) {
  if (hasQuery) {
    return <p className="text-slate-500">No employees match your search.</p>;
  }
  if (archived) {
    return <p className="text-slate-500">No archived employees.</p>;
  }
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-lg font-medium">No employees yet</p>
      <p className="mt-1 text-slate-500">
        Add your team here, or import them from a spreadsheet.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        Add your first employee
      </Button>
    </div>
  );
}

function EmployeeForm({
  initial,
  defaultColor,
  onClose,
}: {
  initial: Employee | null;
  defaultColor: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EmployeeInput>(
    initial
      ? {
          name: initial.name,
          eid: initial.eid,
          role: initial.role,
          rating: initial.rating,
          phone: initial.phone,
          email: initial.email,
          city: initial.city,
          state: initial.state,
          color: initial.color,
          is_on_call: initial.is_on_call,
        }
      : { ...empty, color: defaultColor }
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    const res = await saveEmployee(initial?.id ?? null, {
      ...form,
      name: form.name.trim(),
      email: form.email?.trim().toLowerCase() || null,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
  }

  return (
    <Modal title={initial ? "Edit employee" : "Add employee"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Employee ID (EID)">
            <Input
              value={form.eid ?? ""}
              onChange={(e) => set("eid", e.target.value || null)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role">
            <Input
              value={form.role ?? ""}
              onChange={(e) => set("role", e.target.value || null)}
            />
          </Field>
          <Field label="E-Rating (1–10)">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.rating ?? ""}
              onChange={(e) =>
                set("rating", e.target.value ? Number(e.target.value) : null)
              }
            />
          </Field>
        </div>
        <Field label="Email (where their schedule is sent)">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value || null)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value || null)}
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city ?? ""}
              onChange={(e) => set("city", e.target.value || null)}
            />
          </Field>
        </div>
        <Field label="State">
          <Input
            value={form.state ?? ""}
            onChange={(e) => set("state", e.target.value || null)}
          />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={form.color}
            onChange={(e) => set("color", e.target.value)}
            className="h-10 w-16 rounded border border-slate-300"
          />
        </Field>
        <label className="flex items-center gap-2 text-slate-700">
          <input
            type="checkbox"
            checked={form.is_on_call}
            onChange={(e) => set("is_on_call", e.target.checked)}
          />
          On call
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TimeOffModal({
  employee,
  today,
  onClose,
}: {
  employee: Employee;
  today: string;
  onClose: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);

  // Query gives ascending order; split into past vs upcoming/in-progress.
  const upcoming = employee.time_off.filter((t) => !isPastRange(t, today));
  const past = employee.time_off.filter((t) => isPastRange(t, today));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!start || !end) {
      setError("Pick a start and end date.");
      return;
    }
    setBusy(true);
    const res = await addTimeOff(employee.id, start, end, reason.trim() || null);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setStart("");
    setEnd("");
    setReason("");
  }

  return (
    <Modal title={`Time off — ${employee.name}`} onClose={onClose}>
      <div className="space-y-4">
        {employee.time_off.length === 0 && (
          <p className="text-slate-500">No time off recorded.</p>
        )}

        {upcoming.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-500">Upcoming</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {upcoming.map((t) => (
                <TimeOffRow
                  key={t.id}
                  range={t}
                  today={today}
                  busy={busy}
                  onRemove={async () => {
                    setBusy(true);
                    await removeTimeOff(t.id);
                    setBusy(false);
                  }}
                />
              ))}
            </ul>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              className="text-sm text-slate-500 underline hover:text-slate-800"
            >
              {showPast ? "Hide past" : `Show past (${past.length})`}
            </button>
            {showPast && (
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {past.map((t) => (
                  <TimeOffRow
                    key={t.id}
                    range={t}
                    today={today}
                    busy={busy}
                    onRemove={async () => {
                      setBusy(true);
                      await removeTimeOff(t.id);
                      setBusy(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={add} className="space-y-3 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason (optional)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              Add time off
            </Button>
          </div>
        </form>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TimeOffRow({
  range,
  today,
  busy,
  onRemove,
}: {
  range: TimeOff;
  today: string;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <span>
        {formatRange(range.start_date, range.end_date, today)}
        {range.reason ? ` (${range.reason})` : ""}
      </span>
      <Button variant="ghost" onClick={onRemove} disabled={busy}>
        Remove
      </Button>
    </li>
  );
}
