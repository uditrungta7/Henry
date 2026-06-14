import { createBrowserClient } from "@supabase/ssr";

// Browser client: anon key + the user's session. RLS is enforced on every query.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
