"use client";

// Launch gate wrapping the whole app shell. Asks the Electron main process what
// to show: the optional local-password lock, the "license ended" / "please verify"
// block screens, an optional first-run "set a password" offer, or the app itself.
//
// The gate screens share a modern, glass-on-mesh full-window frame: a soft
// colorful mesh-gradient backdrop, a frosted glass card that floats above it, a
// live clock, and a quiet product footer. Built to feel like a current desktop
// app rather than a flat form.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Alert } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { henry, isElectron } from "@/lib/ipc/client";
import type { GateState } from "./types";

const PROMPT_SEEN_KEY = "password_prompt_seen";
const TAGLINE =
  "Plan the week, press send, and every crew member knows where to be.";

export default function Gate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState | null>(null);
  const [firstRunOffer, setFirstRunOffer] = useState(false);

  const refresh = useCallback(async () => {
    if (!isElectron()) {
      // Outside Electron (static prerender / browser): don't gate.
      setState({ mode: "ok" });
      return;
    }
    const s = await henry().gate.state();
    setState(s);
    // First-run password offer: only when fully ok, no password set, not seen yet.
    if (s.mode === "ok") {
      const hasPw = await henry().auth.hasPassword();
      const seen = await henry().settings.get(PROMPT_SEEN_KEY);
      setFirstRunOffer(!hasPw && seen !== "1");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-evaluate when the main process says the verdict changed behind our back
  // (e.g. a remote password reset arrived while the lock screen was showing).
  useEffect(() => {
    if (!isElectron()) return;
    return henry().gate.onChanged(refresh);
  }, [refresh]);

  if (!state) return <LockFrame>{null}</LockFrame>;

  if (state.mode === "needs-password") {
    return <PasswordLock onUnlocked={refresh} />;
  }
  if (state.mode === "license-ended") {
    return <LicenseEnded onRechecked={refresh} />;
  }
  if (state.mode === "verify-needed") {
    return <VerifyNeeded onRechecked={refresh} />;
  }

  // mode === "ok"
  if (firstRunOffer) {
    return (
      <FirstRunPassword
        onDone={async () => {
          await henry().settings.set(PROMPT_SEEN_KEY, "1");
          setFirstRunOffer(false);
        }}
      />
    );
  }

  return <>{children}</>;
}

// --- shared full-window frame -------------------------------------------------
// Soft colorful mesh-gradient backdrop (blurred blobs) with a live clock up top,
// the gate content floating in a frosted glass card, and a quiet product footer.
// The clock mounts client-side only, so there's no hydration mismatch.
function LockFrame({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      {/* A single soft brand-blue glow high behind the card — a calm hint of
          color and depth, not a busy multi-color mesh. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 -top-44 h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-blue-400/20 blur-[140px]" />
      </div>

      {/* Live clock + date, tucked into the top-right corner. */}
      <div className="absolute right-8 top-8 z-10 text-right">
        <div
          suppressHydrationWarning
          className="text-2xl font-semibold tabular-nums tracking-tight text-slate-800"
        >
          {now
            ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : " "}
        </div>
        <div suppressHydrationWarning className="text-xs font-medium text-slate-500">
          {now
            ? now.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : " "}
        </div>
      </div>

      {/* Content, floating in a glass card, centered on the full screen so it
          sits around the middle rather than up high. */}
      <main className="relative flex flex-1 items-center justify-center px-6">
        {children}
      </main>

      {/* Product brand — the software name — pinned near the bottom, with
          breathing room before the (small) tagline. */}
      <footer className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-6 px-6 pb-6">
        <span className="flex items-center gap-2">
          <LogoMark size={32} />
          <span className="text-2xl font-bold tracking-tight text-slate-900">Henry</span>
        </span>
        <p className="max-w-xs text-center text-xs text-slate-500">{TAGLINE}</p>
      </footer>

      {/* Version, quiet in the corner. */}
      <span className="absolute bottom-4 right-5 z-10 text-xs tabular-nums text-slate-400">
        v{process.env.NEXT_PUBLIC_APP_VERSION}
      </span>
    </div>
  );
}

// Frosted glass card the gate content floats in — a clearly elevated box.
function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 shadow-[0_30px_80px_-22px_rgba(30,41,59,0.55)] ring-1 ring-slate-900/5 backdrop-blur-xl">
      {children}
    </div>
  );
}

// Vibrant gradient CTA, the one obvious action on each gate screen.
function PrimaryButton({
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${className}`}
    />
  );
}

function PasswordLock({ onUnlocked }: { onUnlocked: () => void }) {
  const [company, setCompany] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState(""); // message shown under the field, "" = none
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    henry()
      .company.get()
      .then((c) => setCompany(c.name?.trim() || null))
      .catch(() => {});
  }, []);

  const heading = company || "Henry";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // Empty attempt: say so instead of silently doing nothing.
    if (!password) {
      setError("Enter your password.");
      setShake(true);
      wrap.current?.querySelector("input")?.focus();
      return;
    }
    setBusy(true);
    setError("");

    const ok = await henry().auth.unlock(password).catch(() => false);
    if (ok) {
      onUnlocked(); // parent swaps the whole screen out
      return;
    }
    setBusy(false);
    setError("That password isn't right. Try again.");
    setShake(true);
    setPassword("");
    wrap.current?.querySelector("input")?.focus();
  }

  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);

  return (
    <LockFrame>
      <GlassCard>
      <form onSubmit={submit} className="flex flex-col items-center">
        <h1 className="max-w-full break-words text-center text-3xl font-bold tracking-tight">
          {heading}
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-500">
          Enter your password to unlock
        </p>

        <div
          ref={wrap}
          onAnimationEnd={() => setShake(false)}
          className={`relative mt-7 w-full ${shake ? "henry-shake" : ""}`}
        >
          <input
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={trackCaps}
            onKeyUp={trackCaps}
            autoFocus
            autoComplete="off"
            name="app-password"
            aria-label="App password"
            aria-invalid={!!error}
            placeholder="Password"
            className={`w-full rounded-xl border bg-white/80 px-4 py-3 pr-11 text-[15px] text-slate-900 placeholder-slate-400 shadow-sm outline-none transition ${
              error
                ? "border-red-400 ring-4 ring-red-500/15"
                : "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
            }`}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {reveal ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.2A9.6 9.6 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.1 6.1A17 17 0 002 12s3.5 7 10 7a9.7 9.7 0 004-.9" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {/* Fixed-height feedback slot so the Unlock button never jumps. */}
        <div className="mt-3 min-h-[1.75rem] w-full text-center" aria-live="polite">
          {error ? (
            <p className="text-sm font-medium text-red-600">{error}</p>
          ) : capsOn ? (
            <p className="text-sm text-amber-600">Caps Lock is on.</p>
          ) : null}
        </div>

        <PrimaryButton type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </PrimaryButton>

        <p className="mt-4 text-center text-xs text-slate-400">
          Forgot your password? Contact support to have it reset.
        </p>
      </form>
      </GlassCard>
    </LockFrame>
  );
}

function LicenseEnded({ onRechecked }: { onRechecked: () => void }) {
  const [busy, setBusy] = useState(false);
  async function recheck() {
    setBusy(true);
    await henry().gate.recheck();
    setBusy(false);
    onRechecked();
  }
  return (
    <LockFrame>
      <GlassCard>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-bold tracking-tight">Your license has ended</h1>
          <p className="mt-2 text-slate-600">
            Henry can&apos;t be used until your license is renewed. Please contact us
            to continue, and we&apos;ll get you back up and running.
          </p>
          <PrimaryButton onClick={recheck} disabled={busy} className="mt-6 w-full">
            {busy ? "Checking…" : "I've renewed — check again"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </LockFrame>
  );
}

function VerifyNeeded({ onRechecked }: { onRechecked: () => void }) {
  const [busy, setBusy] = useState(false);
  async function recheck() {
    setBusy(true);
    await henry().gate.recheck();
    setBusy(false);
    onRechecked();
  }
  return (
    <LockFrame>
      <GlassCard>
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-bold tracking-tight">Please connect to the internet</h1>
          <p className="mt-2 text-slate-600">
            Henry needs to reach the internet to verify your license. Connect,
            then try again.
          </p>
          <PrimaryButton onClick={recheck} disabled={busy} className="mt-6 w-full">
            {busy ? "Checking…" : "Try again"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </LockFrame>
  );
}

function FirstRunPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function setIt(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 4) {
      setError("Use at least 4 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await henry().auth.setPassword(password, null);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <LockFrame>
      <GlassCard>
        <div className="flex flex-col items-center">
          <h1 className="text-center text-2xl font-bold tracking-tight">
            Protect this computer?
          </h1>
          <p className="mt-2 text-center text-slate-600">
            If this is a shared computer, you can set a password to open Henry.
            It&apos;s optional — skip it, or add one later in Settings.
          </p>
          <form onSubmit={setIt} className="mt-6 w-full space-y-4">
            <Field label="Password">
              <Input
                type="password"
                value={password}
                autoFocus
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password"
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <PrimaryButton type="submit" disabled={busy} className="flex-1">
                {busy ? "Saving…" : "Set password"}
              </PrimaryButton>
              <Button type="button" variant="ghost" onClick={onDone}>
                Skip
              </Button>
            </div>
          </form>
        </div>
      </GlassCard>
    </LockFrame>
  );
}
