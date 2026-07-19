"use client";

// Loads employees (with time-off) from the local DB via IPC, then renders the
// (unchanged) EmployeesClient. Replaces the old Supabase server-component fetch.

import { useCallback } from "react";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import { LoadError } from "@/components/ui";
import { isoToday } from "@/lib/dates";
import EmployeesClient, { type Employee } from "./EmployeesClient";

export default function EmployeesPage() {
  const load = useCallback(async () => {
    const employees = (await henry().employees.list()) as Employee[];
    const reasons = await henry().timeOff.getReasons();
    return { employees, reasons };
  }, []);
  const { data, loading, error, reload } = useData(load, "employees");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-slate-500">Loading...</p>;

  return (
    <EmployeesClient
      employees={data.employees}
      today={isoToday()}
      reasons={data.reasons}
    />
  );
}
