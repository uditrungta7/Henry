// Composes the launch gate the renderer obeys: password FIRST (protects the
// machine before anything else is shown), then the license verdict. The
// "unlocked this session" flag lives here in the main process so the renderer
// can't bypass the password by reloading the page.

import { hasAppPassword, verifyAppPassword } from "./auth";
import { getLicenseGate } from "./license";

let unlockedThisSession = false;

export type GateState =
  | { mode: "needs-password" }
  | { mode: "license-ended" }
  | { mode: "verify-needed" }
  | { mode: "ok" };

export function getGateState(): GateState {
  // 1) Password gate first.
  if (hasAppPassword() && !unlockedThisSession) {
    return { mode: "needs-password" };
  }
  // 2) License gate.
  const lic = getLicenseGate();
  if (lic.license === "ended") return { mode: "license-ended" };
  if (lic.license === "verify-needed") return { mode: "verify-needed" };
  return { mode: "ok" };
}

// Attempt to unlock with a password; returns whether it succeeded.
export function tryUnlock(password: string): boolean {
  if (!hasAppPassword()) {
    unlockedThisSession = true;
    return true;
  }
  if (verifyAppPassword(password)) {
    unlockedThisSession = true;
    return true;
  }
  return false;
}

// When the owner sets/clears a password, count this session as already unlocked
// (they're actively using the app), so they aren't immediately re-prompted.
export function markUnlocked(): void {
  unlockedThisSession = true;
}

// "Sign out": forget the session unlock so the password lock returns on reload.
export function lock(): void {
  unlockedThisSession = false;
}
