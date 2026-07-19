"use client";

// Loads customers + the company flag from the local DB via IPC, then renders the
// (unchanged) CustomersClient. Replaces the old Supabase server-component fetch.

import { useCallback } from "react";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import { LoadError } from "@/components/ui";
import CustomersClient, { type Customer } from "./CustomersClient";

export default function CustomersPage() {
  const load = useCallback(
    async () => ({
      customers: (await henry().customers.list()) as Customer[],
      customerEmailEnabled: (await henry().company.get()).customer_email_enabled,
    }),
    []
  );
  const { data, loading, error, reload } = useData(load, "customers");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-slate-500">Loading...</p>;

  return (
    <CustomersClient
      customers={data.customers}
      customerEmailEnabled={data.customerEmailEnabled}
    />
  );
}
