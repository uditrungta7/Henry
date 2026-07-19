"use client";

// Settings → Company: the company name shown in the sidebar and signed at the
// bottom of every schedule email. Stored in the local settings table.

import { useEffect, useState } from "react";
import { Button, Field, Input, Alert } from "@/components/ui";
import { henry, isElectron, emitDataChanged } from "@/lib/ipc/client";

export default function CompanyClient() {
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isElectron()) {
      setLoaded(true);
      return;
    }
    henry()
      .company.get()
      .then((c) => setName(c.name))
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!name.trim()) return;
    setSaving(true);
    await henry().settings.set("company_name", name.trim());
    setSaving(false);
    setMsg("Saved.");
    emitDataChanged(); // sidebar + emails pick the new name up
  }

  if (!loaded) return <p className="text-slate-500">Loading...</p>;

  return (
    <form
      onSubmit={save}
      className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5"
    >
      <Field label="Company name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {msg && <Alert tone="info">{msg}</Alert>}
      <Button type="submit" disabled={saving || !name.trim()}>
        {saving ? "Saving..." : "Save name"}
      </Button>
    </form>
  );
}
