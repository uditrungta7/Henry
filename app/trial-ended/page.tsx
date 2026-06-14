import { getCompanyAndLicense } from "@/lib/auth/company";
import { signOut } from "@/app/actions";

// Shown only to a company whose trial has ended. If the license is active this
// page bounces back to the app, so it can't be reached by a licensed company.
export default async function TrialEndedPage() {
  const { allowed, company } = await getCompanyAndLicense();
  if (allowed) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-3 text-2xl font-bold">Your trial has ended</h1>
        <p className="mb-6 text-slate-600">
          Thanks for trying Henry, {company.name}. To keep using it, please
          contact us to continue.
        </p>
        <form action={signOut}>
          <button className="text-blue-600 underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
