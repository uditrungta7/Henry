"use client";

// App shell. Reads the company name from the local DB via IPC (never hardcoded)
// and renders the sidebar + nav around each page. The old remote auth/license
// gate is gone; the license gate + optional local password arrive in Phase 4.

import { useCallback } from "react";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import Gate from "@/lib/ipc/Gate";
import Nav from "@/components/Nav";
import { LogoMark } from "@/components/Logo";
import SignOutButton from "@/components/SignOutButton";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Gate>
      <AppShell>{children}</AppShell>
    </Gate>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const load = useCallback(async () => (await henry().company.get()).name, []);
  const { data: companyName } = useData(load, "company-name");

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-screen w-60 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4">
        <div>
          <div className="mb-8 flex items-center gap-2.5 px-3 pt-1">
            <LogoMark size={30} className="shrink-0" />
            <span className="text-lg font-bold tracking-tight">Henry</span>
          </div>
          <Nav />
        </div>
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="min-w-0 truncate text-xs font-medium text-slate-400">
            {companyName ?? ""}
          </span>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
