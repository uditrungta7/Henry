import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Company = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  is_licensed: boolean;
  customer_email_enabled: boolean;
};

export type LicenseState =
  | { allowed: true; company: Company }
  | { allowed: false; company: Company };

// Access is allowed when: is_licensed = true OR trial_ends_at IS NULL OR now() < trial_ends_at.
function isLicenseActive(company: Company): boolean {
  if (company.is_licensed) return true;
  if (company.trial_ends_at === null) return true;
  return Date.now() < new Date(company.trial_ends_at).getTime();
}

// Resolves the logged-in user to their company (via the app_users mapping, read
// through RLS) and evaluates the license gate. Server-side only.
//
// - No session -> redirect to /login.
// - No company mapping -> treated as a setup error; redirect to /login.
// Returns the company plus whether access is allowed; the caller decides what to
// render when access is blocked (the "trial ended" screen).
export async function getCompanyAndLicense(): Promise<LicenseState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS limits this to the user's own company row.
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, trial_ends_at, is_licensed, customer_email_enabled")
    .single();

  if (!company) {
    // User has no company mapping — a provisioning gap, not a normal state.
    redirect("/login");
  }

  return { allowed: isLicenseActive(company), company };
}

// Convenience for pages that must be fully usable: redirects to the blocked
// screen instead of returning when the license is inactive.
export async function requireActiveCompany(): Promise<Company> {
  const state = await getCompanyAndLicense();
  if (!state.allowed) redirect("/trial-ended");
  return state.company;
}

// For SERVER ACTIONS and API routes: resolve the caller's company AND enforce
// the license, returning a result rather than redirecting (actions can't
// redirect cleanly). Use this at the top of every mutating action so an
// expired-trial company can't change data by calling the action directly.
export async function requireLicensedCompany(): Promise<
  { companyId: string; company: Company } | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, trial_ends_at, is_licensed, customer_email_enabled")
    .single();
  if (!company) return { error: "No company found." };

  if (!isLicenseActive(company)) {
    return { error: "Your trial has ended. Contact us to continue." };
  }
  return { companyId: company.id, company };
}
