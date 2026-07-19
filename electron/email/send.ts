// Plain-text email send via the customer's own SMTP (nodemailer). The full
// transport + safeStorage password handling is wired in Phase 3; this module owns
// the seam so publish.ts can call sendPlainTextEmail today. Until SMTP is
// configured, sends fail with a clear, actionable message.

import nodemailer from "nodemailer";
import { getDatabase } from "../db";
import { getSmtpPassword } from "../secrets";

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

type SmtpConfig = {
  provider: string | null;
  host: string | null;
  port: number | null;
  secure: "tls" | "ssl" | "none" | null;
  username: string | null;
  fromEmail: string | null;
  fromName: string | null;
};

// Read the non-secret SMTP config from settings.
export function readSmtpConfig(): SmtpConfig {
  const db = getDatabase();
  const get = (k: string) => {
    const row = db.prepare("select value from settings where key=?").get(k) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  };
  const port = get("smtp_port");
  return {
    provider: get("smtp_provider"),
    host: get("smtp_host"),
    port: port ? Number(port) : null,
    secure: (get("smtp_secure") as SmtpConfig["secure"]) ?? null,
    username: get("smtp_username"),
    fromEmail: get("from_email"),
    fromName: get("from_name"),
  };
}

// Build a nodemailer transport from the stored config + the safeStorage password,
// or return an error string explaining what's missing. The transport POOLS a
// single connection (maxConnections: 1) so a whole week-publish reuses one SMTP
// session instead of opening a fresh connection per employee (which providers
// like Gmail throttle). Timeouts bound every phase so a stalled server surfaces
// an error instead of hanging the app forever.
export function buildTransport():
  | { transport: nodemailer.Transporter; cfg: SmtpConfig }
  | { error: string } {
  const cfg = readSmtpConfig();
  if (!cfg.host || !cfg.port || !cfg.username || !cfg.fromEmail) {
    return {
      error:
        "Email isn't set up yet. Open Settings → Email to enter your sending account.",
    };
  }
  const password = getSmtpPassword();
  if (!password) {
    return {
      error: "No email password saved. Re-enter it in Settings → Email.",
    };
  }
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 'ssl' => implicit TLS (465); 'tls' => STARTTLS (587); 'none' => plain.
    secure: cfg.secure === "ssl",
    requireTLS: cfg.secure === "tls",
    auth: { user: cfg.username, pass: password },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
  return { transport, cfg };
}

// A ready-to-use mailer over one pooled connection. Open it ONCE for a batch
// (e.g. publishing a week), send many, then close(). Returns { error } if email
// isn't configured. close() must always be called to release the connection.
export type Mailer = {
  send: (opts: {
    to: string;
    subject: string;
    text: string;
    html?: string; // optional HTML alternative; text stays the fallback
  }) => Promise<SendResult>;
  close: () => void;
};

export function openMailer(): Mailer | { error: string } {
  const built = buildTransport();
  if ("error" in built) return { error: built.error };
  const { transport, cfg } = built;
  // From the customer's own configured address; from_name is the display name.
  const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail!;

  return {
    async send(opts) {
      try {
        const info = await transport.sendMail({
          from,
          to: opts.to,
          subject: opts.subject,
          text: opts.text, // plain-text fallback, always present
          ...(opts.html ? { html: opts.html } : {}),
        });
        return { ok: true, providerMessageId: info.messageId ?? "" };
      } catch (e) {
        return { ok: false, error: friendlyEmailError(e) };
      }
    },
    close() {
      transport.close();
    },
  };
}

// Turn a raw SMTP failure into a sentence a non-technical owner can act on.
// The raw provider text stays in parentheses so support can still diagnose.
export function friendlyEmailError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code ?? "";
  const all = `${code} ${raw}`.toLowerCase();

  let plain: string | null = null;
  if (
    all.includes("eauth") ||
    all.includes("username and password not accepted") ||
    all.includes("invalid login") ||
    all.includes("authentication")
  ) {
    plain =
      "Your email account didn't accept the username or password. Open Settings, then Email, and re-enter them. Gmail needs a 16-character app password, not your normal password.";
  } else if (all.includes("missing credentials")) {
    plain =
      "No email password is saved. Open Settings, then Email, and enter the password for your sending account.";
  } else if (all.includes("enotfound") || all.includes("edns") || all.includes("getaddrinfo")) {
    plain =
      "Henry couldn't find your email provider. Check the server name in Settings, then Email, and make sure you're connected to the internet.";
  } else if (
    all.includes("etimedout") ||
    all.includes("econnection") ||
    all.includes("econnrefused") ||
    all.includes("esocket") ||
    all.includes("timed out") ||
    all.includes("network")
  ) {
    plain =
      "Henry couldn't reach your email provider. Check your internet connection and try again.";
  } else if (all.includes("certificate") || all.includes("self signed") || all.includes("wrong version number")) {
    plain =
      "There was a security problem talking to your email provider. Check the port and security settings in Settings, then Email.";
  }

  if (!plain) return `The email couldn't be sent. (${raw})`;
  // Keep a short raw hint for support without burying the plain message.
  const hint = raw.length > 80 ? raw.slice(0, 80) + "..." : raw;
  return `${plain} (${hint})`;
}

// One-off send (test email, single resend). Opens a mailer, sends, and always
// closes it. For batches use openMailer() directly so the connection is reused.
export async function sendPlainTextEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const mailer = openMailer();
  if ("error" in mailer) return { ok: false, error: mailer.error };
  try {
    return await mailer.send(opts);
  } finally {
    mailer.close();
  }
}
