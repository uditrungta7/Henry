"use client";

// Settings → Email: the customer enters their OWN sending account once, here.
// Picking a provider preset fills the server settings; Custom exposes them. The
// password is stored in the OS keychain (safeStorage), never in the database.
// "Send test email" confirms the setup and reports the exact SMTP error on failure.
//
// Built from the same UI primitives as the rest of the app so it matches exactly.

import { useEffect, useState } from "react";
import { Button, Field, Input, Select, Alert } from "@/components/ui";
import { henry, isElectron } from "@/lib/ipc/client";
import type { SmtpSecure } from "@/lib/ipc/types";
import { PRESETS, presetById, type ProviderId } from "./presets";

type Form = {
  provider: ProviderId;
  fromName: string;
  fromEmail: string;
  username: string;
  password: string;
  host: string;
  port: string;
  secure: SmtpSecure;
};

const EMPTY: Form = {
  provider: "gmail",
  fromName: "",
  fromEmail: "",
  username: "",
  password: "",
  host: "smtp.gmail.com",
  port: "587",
  secure: "tls",
};

export default function EmailClient() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [hasPassword, setHasPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [testResult, setTestResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  // Load any existing config so the form reflects what's saved.
  useEffect(() => {
    if (!isElectron()) {
      setLoaded(true);
      return;
    }
    henry()
      .email.getConfig()
      .then((cfg) => {
        setForm({
          provider: (cfg.provider || "gmail") as ProviderId,
          fromName: cfg.fromName,
          fromEmail: cfg.fromEmail,
          username: cfg.username,
          password: "",
          host: cfg.host || "smtp.gmail.com",
          port: cfg.port != null ? String(cfg.port) : "587",
          secure: (cfg.secure || "tls") as SmtpSecure,
        });
        setHasPassword(cfg.hasPassword);
      })
      .finally(() => setLoaded(true));
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Choosing a preset fills the server settings; Custom keeps whatever's there.
  function chooseProvider(id: ProviderId) {
    const preset = presetById(id);
    setForm((f) => ({
      ...f,
      provider: id,
      host: preset.host ?? f.host,
      port: preset.port != null ? String(preset.port) : f.port,
      secure: preset.secure ?? f.secure,
    }));
  }

  const isCustom = form.provider === "custom";
  const hint = presetById(form.provider).hint;

  // Provider-aware password label so it's unmistakable this is the EMAIL password
  // (the page also has a separate "App password" section further down).
  const passwordLabel =
    form.provider === "gmail"
      ? "Gmail app password"
      : form.provider === "office365"
        ? "Microsoft 365 password"
        : "Email account password";

  async function save() {
    setSaving(true);
    setSavedMsg("");
    setTestResult(null);
    const res = await henry().email.saveConfig({
      provider: form.provider,
      host: form.host.trim(),
      port: Number(form.port) || 0,
      secure: form.secure,
      username: form.username.trim(),
      fromEmail: form.fromEmail.trim(),
      fromName: form.fromName.trim(),
    });
    // Only write the password when the owner typed a new one (blank leaves the
    // existing saved password untouched).
    if (!res.error && form.password.length > 0) {
      await henry().email.savePassword(form.password);
      setHasPassword(true);
      set("password", "");
    }
    setSaving(false);
    setSavedMsg(res.error ? "" : "Saved.");
    if (res.error) setTestResult({ ok: false, error: res.error });
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    setSavedMsg("");
    // Save first so the test uses exactly what's on screen.
    await save();
    const res = await henry().email.sendTest();
    setTesting(false);
    setTestResult(res.ok ? { ok: true } : { ok: false, error: res.error ?? "Test failed." });
  }

  if (!loaded) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <Field label="Email provider">
        <Select
          value={form.provider}
          onChange={(e) => chooseProvider(e.target.value as ProviderId)}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="From name">
          <Input
            value={form.fromName}
            onChange={(e) => set("fromName", e.target.value)}
            placeholder="Acme Services"
          />
        </Field>
        <Field label="From address">
          <Input
            type="email"
            value={form.fromEmail}
            onChange={(e) => set("fromEmail", e.target.value)}
            placeholder="dispatch@yourcompany.com"
          />
        </Field>
      </div>

      <Field label="Username">
        <Input
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          placeholder="Usually the same as your from address"
        />
      </Field>

      <Field
        label={
          hasPassword
            ? `${passwordLabel} (saved, leave blank to keep)`
            : passwordLabel
        }
      >
        <Input
          type="password"
          value={form.password}
          autoComplete="new-password"
          onChange={(e) => set("password", e.target.value)}
          placeholder={hasPassword ? "••••••••" : ""}
        />
        <p className="mt-1 text-sm text-slate-500">
          The password for the sending email account above, not a Henry password.
        </p>
      </Field>

      {isCustom && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Field label="SMTP server">
              <Input
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
                placeholder="smtp.yourprovider.com"
              />
            </Field>
          </div>
          <Field label="Port">
            <Input
              type="number"
              value={form.port}
              onChange={(e) => set("port", e.target.value)}
              placeholder="587"
            />
          </Field>
          <div className="col-span-3">
            <Field label="Security">
              <Select
                value={form.secure}
                onChange={(e) => set("secure", e.target.value as SmtpSecure)}
              >
                <option value="tls">STARTTLS (usually port 587)</option>
                <option value="ssl">SSL/TLS (usually port 465)</option>
                <option value="none">None</option>
              </Select>
            </Field>
          </div>
        </div>
      )}

      {hint && <p className="text-sm text-slate-500">{hint}</p>}

      {savedMsg && <Alert tone="info">{savedMsg}</Alert>}
      {testResult?.ok && (
        <Alert tone="info">Test email sent to {form.fromEmail}. Check your inbox.</Alert>
      )}
      {testResult && !testResult.ok && <Alert tone="error">{testResult.error}</Alert>}

      <div className="flex gap-3 pt-1">
        <Button onClick={save} disabled={saving || testing}>
          {saving ? "Saving..." : "Save email settings"}
        </Button>
        <Button variant="secondary" onClick={sendTest} disabled={saving || testing}>
          {testing ? "Sending..." : "Send test email"}
        </Button>
      </div>
    </div>
  );
}
