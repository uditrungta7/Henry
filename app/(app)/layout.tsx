import { requireActiveCompany } from "@/lib/auth/company";
import { signOut } from "@/app/actions";
import Nav from "@/components/Nav";

// Gates the entire app: requires a logged-in user with an active license.
// A blocked company is redirected to /trial-ended before any page renders.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const company = await requireActiveCompany();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col justify-between border-r border-slate-200 bg-white p-4">
        <div>
          <div className="mb-6 px-3">
            <div className="text-xl font-bold">{company.name}</div>
            <div className="text-sm text-slate-500">Henry</div>
          </div>
          <Nav />
        </div>
        <form action={signOut} className="px-3">
          <button className="text-sm text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
