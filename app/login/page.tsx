"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login } from "./actions";
import { LogoMark } from "@/components/Logo";

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-blue-700 px-4 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

const HIGHLIGHTS = [
  {
    title: "Build the day on a simple board",
    body: "Drag your team onto each job site, morning or afternoon.",
  },
  {
    title: "Send it with one click",
    body: "Everyone gets a clear email with where and when they work.",
  },
  {
    title: "No training needed",
    body: "Plain language, big buttons, nothing to set up.",
  },
];

export default function LoginPage() {
  const [state, formAction] = useFormState(login, null);

  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      {/* Brand panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-700 to-indigo-700 p-8 text-white md:w-1/2 md:p-12">
        {/* Soft decorative glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <LogoMark size={40} />
          <span className="text-2xl font-bold tracking-tight">Henry</span>
        </div>

        <div className="relative my-10 hidden md:block">
          <h2 className="max-w-md text-3xl font-bold leading-tight">
            Schedule your crew and send their day in seconds.
          </h2>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                  ✓
                </span>
                <div>
                  <div className="font-semibold">{h.title}</div>
                  <div className="text-sm text-blue-100">{h.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden text-sm text-blue-100 md:block">
          Scheduling for small contractor teams.
        </p>
      </section>

      {/* Sign-in panel */}
      <section className="flex flex-1 items-center justify-center bg-slate-50 p-6 md:p-12">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="mb-8 mt-1 text-slate-600">
            Sign in to manage your schedule.
          </p>

          <form action={formAction} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1 block font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-lg focus:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-lg focus:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>

            {state?.error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
                {state.error}
              </p>
            )}

            <SignInButton />
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Trouble signing in? Contact us and we&apos;ll help.
          </p>
        </div>
      </section>
    </main>
  );
}
