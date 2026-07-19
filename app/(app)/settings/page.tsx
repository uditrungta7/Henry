"use client";

// Settings. Loads the company name + export data from the local DB via IPC, then
// renders the (unchanged) ExportClient. Replaces the Supabase server fetch.
// The Email setup panel is added in Phase 3.

import { useCallback } from "react";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import { Button, LoadError } from "@/components/ui";
import ExportClient, { type ExportData } from "./ExportClient";
import CompanyClient from "./CompanyClient";
import EmailClient from "./EmailClient";
import PasswordClient from "./PasswordClient";
import ReasonsClient from "./ReasonsClient";
import LicenseClient from "./LicenseClient";

export default function SettingsPage() {
  const load = useCallback(async () => {
    const company = await henry().company.get();
    const customers = await henry().customers.list();
    const employees = await henry().employees.list();
    const data: ExportData = {
      customers: customers
        .filter((c) => c.is_active)
        .map((c) => ({
          name: c.name,
          address: c.address,
          contact_name: c.contact_name,
          phone: c.phone,
          open_start: c.open_start,
          open_end: c.open_end,
        })),
      employees: employees
        .filter((e) => e.is_active)
        .map((e) => ({
          name: e.name,
          eid: e.eid,
          role: e.role,
          rating: e.rating,
          phone: e.phone,
          email: e.email,
          city: e.city,
          state: e.state,
        })),
    };
    return { companyName: company.name, data };
  }, []);

  const { data, loading, error, reload } = useData(load, "settings");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Company</h2>
        <p className="mb-4 text-slate-600">
          Your company name, shown in the app and at the bottom of every
          schedule email.
        </p>
        <CompanyClient />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Email</h2>
        <p className="mb-4 text-slate-600">
          Set up the email account Henry sends schedules from. Your team will
          receive their schedules from this address.
        </p>
        <EmailClient />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Export your data</h2>
        <p className="mb-4 text-slate-600">
          Download your customers and employees as Excel files.
        </p>
        <ExportClient data={data.data} companyName={data.companyName} />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Time-off reasons</h2>
        <p className="mb-4 text-slate-600">
          The reasons you can pick from when recording an employee&apos;s time off.
        </p>
        <ReasonsClient />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">App password</h2>
        <p className="mb-4 text-slate-600">
          Require a password to open Henry on this computer. Useful on a shared
          office computer.
        </p>
        <PasswordClient />
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">User guides</h2>
        <p className="mb-4 text-slate-600">
          The guides that come with Henry: how to set it up, and how to use it
          day to day.
        </p>
        <div className="flex max-w-lg gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <Button variant="secondary" onClick={() => void henry().docs.open("setup")}>
            Open setup guide
          </Button>
          <Button
            variant="secondary"
            onClick={() => void henry().docs.open("operations")}
          >
            Open user guide
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">License</h2>
        <p className="mb-4 text-slate-600">
          Where your Henry license stands, and the ID we&apos;ll ask for if you
          contact us about it.
        </p>
        <LicenseClient />
      </section>
    </div>
  );
}
