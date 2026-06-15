import { requireActiveCompany } from "@/lib/auth/company";
import Nav from "@/components/Nav";
import { LogoMark } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";

// Gates the entire app: requires a logged-in user with an active license.
// A blocked company is redirected to /trial-ended before any page renders.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const company = await requireActiveCompany();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-screen w-60 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4">
        <div>
          <div className="mb-6 px-3">
            <div className="mb-2 flex items-center gap-2">
              <LogoMark size={28} />
              <span className="text-sm font-semibold text-slate-500">Henry</span>
            </div>
            <div className="text-xl font-bold">{company.name}</div>
          </div>
          <Nav />
        </div>
        <div className="px-3">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
