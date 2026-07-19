// Henry license check, Supabase Edge Function.
//
// Place at: supabase/functions/check-license/index.ts
// Deploy:   supabase functions deploy check-license --no-verify-jwt
//   (--no-verify-jwt makes it a public endpoint the desktop app can call directly.)
//
// The app POSTs { license_id, company_hint? } on launch. The function:
//   - registers the machine BLOCKED the first time it sees a license_id
//     (approval required: no automatic free trial, so installing on extra
//     devices earns nothing until we activate each one)
//   - returns the current status so the app can allow or block use
//
// To activate a machine, edit its row in the dashboard (Table Editor -> licenses):
//   - grant a trial:  set trial_ends_at to a future date
//   - mark purchased: set is_licensed = true
//   - cut off:        set revoked = true

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json().catch(() => ({}));
  const licenseId: unknown = body.license_id;
  // Treat blank/whitespace as "no hint" so we never store an empty string.
  const companyHint: string | null =
    (typeof body.company_hint === "string" ? body.company_hint.trim() : "") || null;

  if (typeof licenseId !== "string" || licenseId.length === 0) {
    return Response.json({ valid: false, reason: "missing_license_id" }, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Look up the license.
  let { data: lic } = await supabase
    .from("licenses")
    .select("*")
    .eq("id", licenseId)
    .maybeSingle();

  // First contact for this install: register it BLOCKED (trial already expired)
  // and wait for us to approve the machine in the dashboard.
  if (!lic) {
    const { data: created, error } = await supabase
      .from("licenses")
      .insert({
        id: licenseId,
        company_name: companyHint,
        is_licensed: false,
        trial_ends_at: new Date().toISOString(),
        revoked: false,
        last_seen_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) {
      return Response.json({ valid: false, reason: "register_failed" }, { status: 500 });
    }
    lic = created;
  } else {
    // Remote password reset: if the owner flipped the flag in the dashboard,
    // deliver it once and clear it in the same request, so exactly one check
    // clears the machine's local password.
    const resetPassword = lic.reset_password === true;
    // Best-effort: record that we saw this install, and fill the company name if
    // it's still blank. A blank stored value can be "" (from older clients) or
    // null, so we check for a real, non-empty name before deciding to keep it.
    const existingName = (lic.company_name ?? "").trim();
    await supabase
      .from("licenses")
      .update({
        last_seen_at: new Date().toISOString(),
        // Prefer the latest name the machine sends; a blank hint keeps the
        // existing name rather than wiping it.
        company_name: companyHint || existingName,
        ...(resetPassword ? { reset_password: false } : {}),
      })
      .eq("id", licenseId);
    lic.reset_password = resetPassword;
  }

  const notExpired =
    !lic.trial_ends_at || Date.now() < new Date(lic.trial_ends_at).getTime();
  const valid = !lic.revoked && (lic.is_licensed || notExpired);

  return Response.json({
    valid,
    is_licensed: lic.is_licensed,
    trial_ends_at: lic.trial_ends_at,
    revoked: lic.revoked,
    company_name: lic.company_name,
    reset_password: lic.reset_password === true,
  });
});
