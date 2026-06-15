"use client";

import { useEffect } from "react";

// Small shared UI primitives so the data screens look consistent and stay simple.

// Shared focus ring for keyboard users (accessibility).
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary: "bg-blue-700 text-white hover:bg-blue-800",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${styles} ${className}`}
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
