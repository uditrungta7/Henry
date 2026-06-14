// Server-only plain-text email send via Resend. Configured by us through
// EMAIL_API_KEY and EMAIL_FROM; the customer sets nothing.

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

// Extract the bare address from an EMAIL_FROM that may be "Name <addr>" or "addr".
function fromAddress(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim();
}

export async function sendPlainTextEmail(opts: {
  to: string;
  subject: string;
  text: string;
  // Display name for the sender (e.g. the company name). The address always
  // comes from EMAIL_FROM — our one verified sender — so deliverability holds.
  fromName?: string;
}): Promise<SendResult> {
  const apiKey = process.env.EMAIL_API_KEY;
  const configuredFrom = process.env.EMAIL_FROM;

  if (!apiKey || !configuredFrom) {
    return { ok: false, error: "Email is not configured on the server." };
  }

  const from = opts.fromName
    ? `${opts.fromName} <${fromAddress(configuredFrom)}>`
    : configuredFrom;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text, // plain text only — no html field
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      return { ok: false, error: data.message ?? `Send failed (${res.status}).` };
    }
    return { ok: true, providerMessageId: data.id ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error sending email.",
    };
  }
}
