// SMTP setup: persist the non-secret config to the settings table, the password
// to safeStorage, and run a "send test" so the customer can confirm their account
// before relying on it. Used by the Settings → Email panel via IPC.

import { getDatabase } from "../db";
import { setSmtpPassword, clearSmtpPassword, getSmtpPassword } from "../secrets";
import { readSmtpConfig, sendPlainTextEmail } from "./send";

// The non-secret SMTP fields the renderer sends. Password is handled separately.
export type SmtpConfigInput = {
  provider: string; // 'gmail' | 'office365' | 'custom'
  host: string;
  port: number;
  secure: "tls" | "ssl" | "none";
  username: string;
  fromEmail: string;
  fromName: string;
};

const KEYS: Record<keyof SmtpConfigInput, string> = {
  provider: "smtp_provider",
  host: "smtp_host",
  port: "smtp_port",
  secure: "smtp_secure",
  username: "smtp_username",
  fromEmail: "from_email",
  fromName: "from_name",
};

export function saveEmailConfig(cfg: SmtpConfigInput): { error?: string } {
  const db = getDatabase();
  const set = db.prepare(
    "insert into settings (key, value) values (?, ?) " +
      "on conflict(key) do update set value = excluded.value"
  );
  const write = db.transaction(() => {
    set.run(KEYS.provider, cfg.provider);
    set.run(KEYS.host, cfg.host);
    set.run(KEYS.port, String(cfg.port));
    set.run(KEYS.secure, cfg.secure);
    set.run(KEYS.username, cfg.username);
    set.run(KEYS.fromEmail, cfg.fromEmail);
    set.run(KEYS.fromName, cfg.fromName);
  });
  write();
  return {};
}

// Optionally store/replace the password. An empty string clears it (so the owner
// can remove a saved password); a non-empty string replaces it.
export function saveEmailPassword(password: string): { error?: string } {
  if (password.length === 0) {
    clearSmtpPassword();
  } else {
    setSmtpPassword(password);
  }
  return {};
}

// Current config for the form. Never returns the password itself, only whether
// one is saved, so the form can show "password saved" without exposing it.
export function getEmailConfig(): {
  provider: string;
  host: string;
  port: number | null;
  secure: "tls" | "ssl" | "none" | null;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
} {
  const cfg = readSmtpConfig();
  return {
    provider: cfg.provider ?? "",
    host: cfg.host ?? "",
    port: cfg.port,
    secure: cfg.secure,
    username: cfg.username ?? "",
    fromEmail: cfg.fromEmail ?? "",
    fromName: cfg.fromName ?? "",
    hasPassword: getSmtpPassword() !== null,
  };
}

// Send a plain-text test email to the configured from-address. Returns success or
// the exact SMTP error so the owner can fix their setup.
export async function sendTestEmail(): Promise<{ ok: boolean; error?: string }> {
  const cfg = readSmtpConfig();
  if (!cfg.fromEmail) {
    return { ok: false, error: "Enter and save your from-address first." };
  }
  const res = await sendPlainTextEmail({
    to: cfg.fromEmail,
    subject: "Henry test email",
    text:
      "This is a test from Henry.\n\n" +
      "If you received this, your email is set up correctly and Henry can send " +
      "your team their schedules.\n",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
