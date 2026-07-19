// Provider presets for the Settings → Email panel. Picking a preset fills
// host/port/security automatically; "Custom SMTP" lets the owner enter them.
// Standard submission settings for each provider.

import type { SmtpSecure } from "@/lib/ipc/types";

export type ProviderId = "gmail" | "office365" | "custom";

export type Preset = {
  id: ProviderId;
  label: string;
  // For presets, the fixed SMTP server settings. Null fields (custom) are owner-entered.
  host: string | null;
  port: number | null;
  secure: SmtpSecure | null;
  // A short hint shown under the panel for non-technical owners.
  hint?: string;
};

export const PRESETS: Preset[] = [
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    secure: "tls",
    hint: "Use an App Password (Google Account → Security → App passwords), not your normal password. Don't have one? Search \"app password google\" on the web, create the password there, and put it here.",
  },
  {
    id: "office365",
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    secure: "tls",
    hint: "Use your mailbox address and password. If sign-in is blocked, your admin may need to allow SMTP AUTH.",
  },
  {
    id: "custom",
    label: "Custom SMTP",
    host: null,
    port: null,
    secure: null,
    hint: "Enter the SMTP server, port, and security from your email provider.",
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
}
