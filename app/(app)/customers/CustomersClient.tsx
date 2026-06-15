"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { nextUnusedColor } from "@/lib/colors";
import { saveCustomer, setCustomerActive, type CustomerInput } from "./actions";

export type Customer = {
  id: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  open_start: string | null;
  open_end: string | null;
  color: string;
  notes: string | null;
  notify_email: boolean;
  is_active: boolean;
};

const empty: CustomerInput = {
  name: "",
  address: null,
  contact_name: null,
  phone: null,
  open_start: null,
  open_end: null,
  color: "#2563eb",
  notes: null,
  notify_email: false,
};

export default function CustomersClient({
  customers,
  customerEmailEnabled,
}: {
  customers: Customer[];
  customerEmailEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [pending, setPending] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => c.is_active === !showArchived)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.address ?? "").toLowerCase().includes(q)
      );
  }, [customers, query, showArchived]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Customers</h1>
        <Button onClick={() => setEditing("new")}>Add customer</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or address…"
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
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.address ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.open_start && c.open_end
                      ? `${formatTime(c.open_start)}–${formatTime(c.open_end)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={async () => {
                          setPending(true);
                          await setCustomerActive(c.id, !c.is_active);
                          setPending(false);
                        }}
                      >
                        {c.is_active ? "Archive" : "Unarchive"}
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
        <CustomerForm
          initial={editing === "new" ? null : editing}
          defaultColor={nextUnusedColor(customers.map((c) => c.color))}
          customerEmailEnabled={customerEmailEnabled}
          onClose={() => setEditing(null)}
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
    return <p className="text-slate-500">No customers match your search.</p>;
  }
  if (archived) {
    return <p className="text-slate-500">No archived customers.</p>;
  }
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-lg font-medium">No customers yet</p>
      <p className="mt-1 text-slate-500">
        Add your job sites here, or import them from a spreadsheet.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        Add your first customer
      </Button>
    </div>
  );
}

function CustomerForm({
  initial,
  defaultColor,
  customerEmailEnabled,
  onClose,
}: {
  initial: Customer | null;
  defaultColor: string;
  customerEmailEnabled: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CustomerInput>(
    initial
      ? {
          name: initial.name,
          address: initial.address,
          contact_name: initial.contact_name,
          phone: initial.phone,
          open_start: initial.open_start,
          open_end: initial.open_end,
          color: initial.color,
          notes: initial.notes,
          notify_email: initial.notify_email,
        }
      : { ...empty, color: defaultColor }
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    const res = await saveCustomer(initial?.id ?? null, {
      ...form,
      name: form.name.trim(),
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
  }

  return (
    <Modal title={initial ? "Edit customer" : "Add customer"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Address">
          <Input
            value={form.address ?? ""}
            onChange={(e) => set("address", e.target.value || null)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact name">
            <Input
              value={form.contact_name ?? ""}
              onChange={(e) => set("contact_name", e.target.value || null)}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value || null)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Opens">
            <Input
              type="time"
              value={form.open_start ?? ""}
              onChange={(e) => set("open_start", e.target.value || null)}
            />
          </Field>
          <Field label="Closes">
            <Input
              type="time"
              value={form.open_end ?? ""}
              onChange={(e) => set("open_end", e.target.value || null)}
            />
          </Field>
        </div>
        <Field label="Color">
          <input
            type="color"
            value={form.color}
            onChange={(e) => set("color", e.target.value)}
            className="h-10 w-16 rounded border border-slate-300"
          />
        </Field>
        <Field label="Notes">
          <Input
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
          />
        </Field>

        {customerEmailEnabled && (
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={form.notify_email}
              onChange={(e) => set("notify_email", e.target.checked)}
            />
            Also email this customer their schedule
          </label>
        )}

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
