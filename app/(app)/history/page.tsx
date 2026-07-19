"use client";

// Loads publish history (each publish with its email rows) from the local DB via
// IPC, then renders the (unchanged) HistoryClient. Replaces the Supabase fetch.

import { useCallback } from "react";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import { LoadError } from "@/components/ui";
import HistoryClient, { type PublishRecord } from "./HistoryClient";

export default function HistoryPage() {
  const load = useCallback(async () => {
    const publishes = (await henry().publishes.list()) as PublishRecord[];
    const months = await henry().publishes.months();
    return { publishes, months };
  }, []);
  const { data, loading, error, reload } = useData(load, "history");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-slate-500">Loading...</p>;

  return <HistoryClient publishes={data.publishes} months={data.months} />;
}
