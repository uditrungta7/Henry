"use client";

// Settings → Time-off reasons: the boss manages the dropdown options shown when
// recording employee time off. Add or remove options; "Other" is always available
// in the time-off form as a free-text fallback, so it isn't listed here.

import { useEffect, useState } from "react";
import { Button, Input, Alert } from "@/components/ui";
import { henry, isElectron, emitDataChanged } from "@/lib/ipc/client";

export default function ReasonsClient() {
  const [reasons, setReasons] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isElectron()) {
      setLoaded(true);
      return;
    }
    henry()
      .timeOff.getReasons()
      .then(setReasons)
      .finally(() => setLoaded(true));
  }, []);

  async function save(next: string[]) {
    setReasons(next);
    await henry().timeOff.setReasons(next);
    // So the open Employees screen picks up the change.
    emitDataChanged();
    setMsg("Saved.");
  }

  function add() {
    const v = adding.trim();
    if (!v || reasons.some((r) => r.toLowerCase() === v.toLowerCase())) {
      setAdding("");
      return;
    }
    save([...reasons, v]);
    setAdding("");
  }

  function remove(r: string) {
    save(reasons.filter((x) => x !== r));
  }

  if (!loaded) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {reasons.length === 0 && (
          <li className="px-3 py-2 text-slate-500">No reasons yet.</li>
        )}
        {reasons.map((r) => (
          <li key={r} className="flex items-center justify-between px-3 py-2">
            <span>{r}</span>
            <Button variant="ghost" size="sm" onClick={() => remove(r)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Add a reason (e.g. Jury duty)"
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </form>

      {msg && <Alert tone="info">{msg}</Alert>}
    </div>
  );
}
