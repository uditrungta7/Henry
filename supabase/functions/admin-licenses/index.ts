// Henry license ADMIN, Supabase Edge Function. Powers the hidden Superadmin
// screen inside the app.
//
// Deploy:  supabase functions deploy admin-licenses --no-verify-jwt
// Secret:  supabase secrets set HENRY_ADMIN_KEY="your-superadmin-password"
//          (set the secret BEFORE deploying; change it any time by re-running)
//
// The app POSTs { admin_key, action, license_id?, days?, value? }. Every request
// is checked against HENRY_ADMIN_KEY — the passphrase lives only here (as a
// server secret) and in the owner's head, never inside the shipped app.
//
// Actions:
//   list                            -> all license rows, newest first
//   grant_trial  { license_id, days } -> trial_ends_at = now + days, un-revokes
//   set_licensed { license_id, value } -> is_licensed = value, un-revokes
//   set_revoked  { license_id, value } -> revoked = value
// Every action returns the full refreshed list.

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json().catch(() => ({}));

  const adminKey = Deno.env.get("HENRY_ADMIN_KEY");
  if (!adminKey || typeof body.admin_key !== "string" || body.admin_key !== adminKey) {
    return Response.json({ error: "wrong_key" }, { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const action: unknown = body.action;
  const id: unknown = body.license_id;

  if (action === "grant_trial" && typeof id === "string") {
    const days = Number(body.days) > 0 ? Number(body.days) : 60;
    const { error } = await supabase
      .from("licenses")
      .update({
        trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString(),
        revoked: false,
      })
      .eq("id", id);
    if (error) return Response.json({ error: "update_failed" }, { status: 500 });
  } else if (action === "set_licensed" && typeof id === "string") {
    const { error } = await supabase
      .from("licenses")
      .update({ is_licensed: !!body.value, revoked: false })
      .eq("id", id);
    if (error) return Response.json({ error: "update_failed" }, { status: 500 });
  } else if (action === "set_revoked" && typeof id === "string") {
    const { error } = await supabase
      .from("licenses")
      .update({ revoked: !!body.value })
      .eq("id", id);
    if (error) return Response.json({ error: "update_failed" }, { status: 500 });
  } else if (action !== "list") {
    return Response.json({ error: "unknown_action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("licenses")
    .select("*")
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) return Response.json({ error: "query_failed" }, { status: 500 });

  return Response.json({ licenses: data });
});
