"use client";

// Schedule board. Reads date/view from the URL (client-side, via useSearchParams),
// loads the board window from the local DB via IPC, then renders the Board.
// Lives at /schedule; the app home (/) is the dashboard.

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import { LoadError } from "@/components/ui";
import { isoToday, weekDays, weekStart } from "@/lib/dates";
import Board from "./Board";
import type {
  BoardCustomer,
  BoardEmployee,
  BoardAssignment,
  TimeOff,
} from "./types";

function ScheduleBoard() {
  const params = useSearchParams();
  const date = params.get("date") ?? isoToday();
  const view = params.get("view") === "week" ? "week" : "day";

  const days = view === "week" ? weekDays(date) : [date];
  const first = days[0];
  const last = days[days.length - 1];

  const load = useCallback(async () => {
    const board = await henry().board.get(first, last);
    const unsentDates = await henry().drafts.unsentDates();
    // Who is on call for the viewed week, from its most recent publish.
    const lastPublish = await henry().publishes.latestForWeek(weekStart(date));
    return { board, unsentDates, onCallName: lastPublish?.on_call_name ?? null };
  }, [first, last, date]);

  const { data, loading, error, reload } = useData(load, `schedule:${first}:${last}`);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-slate-500">Loading...</p>;

  return (
    <Board
      date={date}
      view={view}
      days={days}
      today={isoToday()}
      customers={data.board.customers as BoardCustomer[]}
      employees={data.board.employees as BoardEmployee[]}
      assignments={data.board.assignments as BoardAssignment[]}
      timeOff={data.board.timeOff as TimeOff[]}
      unsentDates={data.unsentDates}
      onCallName={data.onCallName}
    />
  );
}

export default function SchedulePage() {
  // useSearchParams must sit under a Suspense boundary for the static export.
  return (
    <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
      <ScheduleBoard />
    </Suspense>
  );
}
