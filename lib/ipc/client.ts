"use client";

// Renderer-side access to the Electron main process. All data goes through
// window.henry (exposed by electron/preload.ts). This module adds:
//  - a guard for when window.henry is absent (static build / a plain browser),
//  - a tiny refresh event bus so converted pages re-fetch after a mutation,
//    standing in for the old server-side router.refresh().

import type { HenryApi } from "./types";

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.henry;
}

// The window.henry bridge, or throw a clear error if running outside Electron.
export function henry(): HenryApi {
  if (typeof window === "undefined" || !window.henry) {
    throw new Error(
      "Henry's local data service isn't available. Please open the Henry app."
    );
  }
  return window.henry;
}

// --- Refresh bus -----------------------------------------------------------
// After any successful mutation, the action wrappers call emitDataChanged().
// Converted pages subscribe via onDataChanged() and re-fetch. The frozen
// components keep their router.refresh() calls (now harmless no-ops).

const REFRESH_EVENT = "henry:data-changed";

export function emitDataChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

// Subscribe to data-changed events; returns an unsubscribe function.
export function onDataChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(REFRESH_EVENT, cb);
  return () => window.removeEventListener(REFRESH_EVENT, cb);
}
