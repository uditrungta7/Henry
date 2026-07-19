"use client";

// Dashboard, the app home. Shows a first-run setup checklist until the app is
// ready to use, then a snapshot of the business: quick counts, a trial notice
// when one applies, this week's shifts day by day, and the busiest-customers chart.

import { useCallback } from "react";
import Link from "next/link";
import { useData } from "@/lib/ipc/useData";
import { henry } from "@/lib/ipc/client";
import { LoadError } from "@/components/ui";
import { isoToday, addDays, weekDays, formatUsDate } from "@/lib/dates";

export default function DashboardPage() {
  const load = useCallback(async () => {
    const today = isoToday();
    const week = weekDays(today);
    const chartStart = addDays(today, -29); // last 30 days, incl. today
    const [company, emailCfg, customers, employees, hasPassword, license, board] =
      await Promise.all([
        henry().company.get(),
        henry().email.getConfig(),
        henry().customers.list(),
        henry().employees.list(),
        henry().auth.hasPassword(),
        henry().gate.status(),
        // One window that covers both the chart (past 30 days) and this week.
        henry().board.get(chartStart, week[6]),
      ]);
    return {
      today,
      week,
      chartStart,
      company,
      emailCfg,
      customers,
      employees,
      hasPassword,
      license,
      assignments: board.assignments as {
        work_date: string;
        customer_id: string;
      }[],
    };
  }, []);

  const { data, loading, error, reload } = useData(load, "dashboard");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (loading || !data) return <p className="text-slate-500">Loading...</p>;

  const activeCustomers = data.customers.filter((c) => c.is_active);
  const activeEmployees = data.employees.filter((e) => e.is_active);
  const emailReady = !!data.emailCfg.fromEmail && data.emailCfg.hasPassword;
  const setupDone =
    emailReady && activeEmployees.length > 0 && activeCustomers.length > 0;

  const weekShifts = data.assignments.filter(
    (a) => a.work_date >= data.week[0] && a.work_date <= data.week[6]
  ).length;

  const trialNotice =
    data.license.endpointConfigured &&
    !data.license.isLicensed &&
    data.license.trialEndsAt
      ? `Your free trial runs until ${formatUsDate(data.license.trialEndsAt.slice(0, 10))}.`
      : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-slate-500">
          {new Date(data.today + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      {trialNotice && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
          {trialNotice} See <Link href="/settings" className="underline">Settings</Link> for
          your license details.
        </p>
      )}

      {!setupDone && (
        <SetupCard
          companyName={data.company.name}
          emailReady={emailReady}
          hasEmployees={activeEmployees.length > 0}
          hasCustomers={activeCustomers.length > 0}
          hasAppPassword={data.hasPassword}
        />
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Active customers" value={activeCustomers.length} href="/customers" />
        <StatTile label="Active employees" value={activeEmployees.length} href="/employees" />
        <StatTile label="Shifts this week" value={weekShifts} href="/schedule" />
      </div>

      <div className="grid grid-cols-3 items-start gap-4">
        <div className="col-span-2">
          <CustomerChart
            customers={activeCustomers}
            assignments={data.assignments.filter(
              (a) => a.work_date >= data.chartStart && a.work_date <= data.today
            )}
          />
        </div>
        <ThisWeekCard
          week={data.week}
          today={data.today}
          assignments={data.assignments}
        />
      </div>
    </div>
  );
}

// --- first-run setup ---------------------------------------------------------

function SetupCard({
  companyName,
  emailReady,
  hasEmployees,
  hasCustomers,
  hasAppPassword,
}: {
  companyName: string;
  emailReady: boolean;
  hasEmployees: boolean;
  hasCustomers: boolean;
  hasAppPassword: boolean;
}) {
  const steps: { done: boolean; label: string; detail: string; href: string; cta: string }[] = [
    {
      done: companyName.trim().length > 0,
      label: "Name your company",
      detail:
        "Shown in the app and signed at the bottom of every schedule email. Set it before you publish.",
      href: "/settings",
      cta: "Set",
    },
    {
      done: emailReady,
      label: "Connect your email",
      detail: "The account Henry sends schedules from. Takes about two minutes.",
      href: "/settings",
      cta: "Set up",
    },
    {
      done: hasEmployees,
      label: "Add your employees",
      detail: "Type them in or import your spreadsheet.",
      href: "/employees",
      cta: "Add",
    },
    {
      done: hasCustomers,
      label: "Add your customers",
      detail: "The sites your team works at. Import works here too.",
      href: "/customers",
      cta: "Add",
    },
    {
      done: hasAppPassword,
      label: "Set an app password (optional)",
      detail: "Locks Henry on a shared office computer.",
      href: "/settings",
      cta: "Set",
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
      <h2 className="text-xl font-semibold">Let&apos;s get Henry set up</h2>
      <p className="mb-4 mt-1 text-slate-600">
        {remaining} step{remaining === 1 ? "" : "s"} left, then you can schedule
        your first week and email everyone their plan.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                s.done ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              {s.done ? "✓" : "•"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block font-medium ${s.done ? "text-slate-400 line-through" : ""}`}>
                {s.label}
              </span>
              {!s.done && <span className="block text-sm text-slate-500">{s.detail}</span>}
            </span>
            {!s.done && (
              <Link
                href={s.href}
                className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- stat tiles ---------------------------------------------------------------

function StatTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300"
    >
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </Link>
  );
}

// --- this week ----------------------------------------------------------------

function ThisWeekCard({
  week,
  today,
  assignments,
}: {
  week: string[];
  today: string;
  assignments: { work_date: string }[];
}) {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    counts.set(a.work_date, (counts.get(a.work_date) ?? 0) + 1);
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">This week</h2>
        <Link href="/schedule" className="text-sm font-medium text-blue-700 hover:underline">
          Open schedule
        </Link>
      </div>
      <ul className="mt-3 space-y-1">
        {week.map((d) => {
          const isToday = d === today;
          const n = counts.get(d) ?? 0;
          return (
            <li
              key={d}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                isToday ? "bg-blue-50 font-medium text-blue-900" : "text-slate-600"
              }`}
            >
              <span>
                {new Date(d + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                {isToday && " · today"}
              </span>
              <span className="tabular-nums">
                {n === 0 ? "—" : `${n} shift${n === 1 ? "" : "s"}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- busiest-customers chart ---------------------------------------------------

const CHART_LIMIT = 12;

function CustomerChart({
  customers,
  assignments,
}: {
  customers: { id: string; name: string }[];
  assignments: { customer_id: string }[];
}) {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    counts.set(a.customer_id, (counts.get(a.customer_id) ?? 0) + 1);
  }
  const rows = customers
    .map((c) => ({ name: c.name, count: counts.get(c.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const shown = rows.slice(0, CHART_LIMIT);
  const max = shown[0]?.count ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Busiest customers</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500">
        Scheduled jobs in the last 30 days.
      </p>

      {shown.length === 0 ? (
        <p className="text-slate-500">
          No jobs in the last 30 days yet. Once you schedule work, your busiest
          sites show up here.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-3"
              title={`${r.name}: ${r.count} job${r.count === 1 ? "" : "s"} in the last 30 days`}
            >
              <span className="w-44 shrink-0 truncate text-sm text-slate-700">
                {r.name}
              </span>
              <span className="h-3 flex-1 rounded-full bg-slate-100">
                <span
                  className="block h-3 rounded-full bg-blue-600"
                  style={{ width: `${Math.max((r.count / max) * 100, 2)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-sm tabular-nums text-slate-600">
                {r.count}
              </span>
            </div>
          ))}
          {rows.length > CHART_LIMIT && (
            <p className="pt-1 text-xs text-slate-400">
              +{rows.length - CHART_LIMIT} more customers with fewer jobs.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
