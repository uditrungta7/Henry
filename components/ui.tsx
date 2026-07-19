"use client";

import { useEffect, useRef, useState } from "react";
import { isoToUs, usToIso } from "@/lib/dates";

// Small shared UI primitives so the data screens look consistent and stay simple.

// Shared focus ring for keyboard users (accessibility).
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const styles = {
    primary: "bg-blue-700 text-white hover:bg-blue-800",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  const sizing = size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-2";
  return (
    <button
      {...props}
      className={`rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${FOCUS} ${styles} ${className}`}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 ${FOCUS} disabled:bg-slate-100 disabled:text-slate-400 ${props.className ?? ""}`}
    />
  );
}

// Auto-inserts slashes as digits are typed: "07132026" -> "07/13/2026".
function maskUs(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += "/" + d.slice(2, 4);
  if (d.length > 4) out += "/" + d.slice(4, 8);
  return out;
}

// US-format date field. Displays and accepts MM/DD/YYYY on every machine (unlike
// the native date picker, which follows the OS region), while storing/emitting an
// ISO date (yyyy-mm-dd) so the rest of the app is unchanged. Emits "" while the
// entry is incomplete or not a real date.
//
// A calendar button opens the browser's date picker (via a visually hidden native
// date input), so dates can be clicked instead of typed — the picked date still
// lands in the field as MM/DD/YYYY.
export function UsDateInput({
  value,
  onChange,
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string; // ISO yyyy-mm-dd, or ""
  onChange: (iso: string) => void;
}) {
  const [text, setText] = useState(() => isoToUs(value));
  const pickerRef = useRef<HTMLInputElement>(null);
  // Resync from the parent only when its value diverges from what the text
  // currently represents, so typing an incomplete date is never wiped.
  useEffect(() => {
    if ((usToIso(text) ?? "") !== (value ?? "")) setText(isoToUs(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function openCalendar() {
    const el = pickerRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // Very old engines without showPicker(): focus falls back to the field.
      el.focus();
    }
  }

  return (
    <div className="relative">
      <input
        {...props}
        inputMode="numeric"
        placeholder="MM/DD/YYYY"
        value={text}
        onChange={(e) => {
          const masked = maskUs(e.target.value);
          setText(masked);
          onChange(usToIso(masked) ?? "");
        }}
        className={`w-full rounded-lg border border-slate-300 py-2 pl-3 pr-10 ${FOCUS} disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
      />
      {/* Hidden native date input: only its calendar popup is ever shown. It sits
          under the button so the popup opens anchored to the field. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ""}
        onChange={(e) => {
          const iso = e.target.value;
          setText(isoToUs(iso));
          onChange(iso);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open calendar"
        disabled={props.disabled}
        onClick={openCalendar}
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40 ${FOCUS}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
    </div>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 ${FOCUS} disabled:bg-slate-100 disabled:text-slate-400 ${props.className ?? ""}`}
    />
  );
}

// Status pill, shared across publish results and history.
const BADGE_STYLES: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  unchanged: "bg-slate-100 text-slate-600",
  skipped: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  queued: "bg-slate-100 text-slate-600",
  draft: "bg-slate-100 text-slate-600",
};

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof BADGE_STYLES | string;
  children: React.ReactNode;
}) {
  const style = BADGE_STYLES[tone] ?? BADGE_STYLES.queued;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {children}
    </span>
  );
}

// Full-page load-failure state, so a failed data fetch shows a clear message and
// a retry instead of an endless "Loading...". Used by the page-level loaders.
export function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
      <p className="font-semibold">Something went wrong loading this page.</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// Inline message block (error/info/warning).
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "warning";
  children: React.ReactNode;
}) {
  const style = {
    error: "bg-red-50 text-red-700",
    info: "bg-blue-50 text-blue-800",
    warning: "bg-amber-50 text-amber-800",
  }[tone];
  return <p className={`rounded-lg px-3 py-2 ${style}`}>{children}</p>;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// In-app confirm dialog (replaces window.confirm so it matches the app).
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-slate-600">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
