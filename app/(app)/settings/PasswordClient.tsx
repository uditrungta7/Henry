"use client";

// Settings → App password: set, change, or remove the optional local password
// that protects Henry on a shared computer. Built from the existing ui.tsx
// primitives. The password is stored only as a hash in the OS keychain.

import { useEffect, useState } from "react";
import { Button, Field, Input, Alert } from "@/components/ui";
import { henry, isElectron, emitDataChanged } from "@/lib/ipc/client";

export default function PasswordClient() {
  const [hasPassword, setHasPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isElectron()) {
      setLoaded(true);
      return;
    }
    henry()
      .auth.hasPassword()
      .then(setHasPassword)
      .finally(() => setLoaded(true));
  }, []);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (next.length < 4) {
      setError("Use at least 4 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await henry().auth.setPassword(next, hasPassword ? current : null);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setHasPassword(true);
    reset();
    setMsg("Password set.");
    emitDataChanged(); // so the Lock button in the sidebar appears
  }

  async function remove() {
    setError("");
    setMsg("");
    setBusy(true);
    // Removing requires the current password (empty new password = remove).
    const res = await henry().auth.setPassword("", current);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setHasPassword(false);
    reset();
    setMsg("Password removed.");
    emitDataChanged(); // so the Lock button in the sidebar disappears
  }

  if (!loaded) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-slate-600">
        {hasPassword
          ? "A password is required to open Henry on this computer."
          : "No password is set. Anyone who opens Henry can use it."}
      </p>
      {hasPassword && (
        <p className="text-sm text-slate-500">
          Forgot your password? Contact support — it can be reset remotely, no
          data is lost.
        </p>
      )}

      <form onSubmit={save} className="space-y-4">
        {hasPassword && (
          <Field label="Current password">
            <Input
              type="password"
              value={current}
              autoComplete="off"
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label={hasPassword ? "New password" : "Password"}>
            <Input
              type="password"
              value={next}
              autoComplete="new-password"
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm">
            <Input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>

        {error && <Alert>{error}</Alert>}
        {msg && <Alert tone="info">{msg}</Alert>}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : hasPassword ? "Change password" : "Set password"}
          </Button>
          {hasPassword && (
            <Button type="button" variant="secondary" disabled={busy} onClick={remove}>
              Remove password
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
