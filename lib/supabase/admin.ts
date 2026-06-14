import { createClient } from "@supabase/supabase-js";

// Admin client: service role key. BYPASSES RLS — server-side only, never sent to
// the browser. Use ONLY for provisioning and the server-side email send, and
// always scope every query by company_id explicitly.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
