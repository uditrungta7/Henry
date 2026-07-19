"use client";

// "Lock" in the desktop app: forget the session unlock so the password screen
// returns, then reload to the app root (NOT the current route) so the Gate
// re-evaluates and shows the lock. There is no remote session to sign out of.

import { isElectron, henry } from "@/lib/ipc/client";

export async function signOut(): Promise<void> {
  if (isElectron()) {
    await henry().auth.lock();
  }
  if (typeof window !== "undefined") {
    // Go to the app root so the Gate re-runs; "./" would resolve to the current
    // route's directory (e.g. /customers/) and not show the lock screen.
    window.location.href = window.location.origin + "/";
  }
}
