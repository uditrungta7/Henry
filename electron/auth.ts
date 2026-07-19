// Optional local app password. Protects the data on a shared office computer.
// We store ONLY a salted scrypt hash (in safeStorage, via secrets.ts), never the
// password itself. Skippable; when unset, the app isn't password-gated.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  setAppPasswordHash,
  getAppPasswordHash,
  clearAppPasswordHash,
  appPasswordHashExists,
} from "./secrets";

// Stored form: "scrypt:<saltHex>:<hashHex>".
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyAgainst(stored: string, password: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hasAppPassword(): boolean {
  // Presence of the hash file — NOT its decryptability — decides whether a
  // password is set. If the file exists but can't be decrypted (keyring down),
  // we still report "set" so the lock screen shows and we fail closed.
  return appPasswordHashExists();
}

// Set or change the password. An empty string removes it. We trim so a stray
// leading/trailing space (easy to introduce when typing or pasting) can't make a
// correct password fail to match later, since set and verify both trim the same way.
export function setAppPassword(password: string): { error?: string } {
  const pw = password.trim();
  if (pw.length === 0) {
    clearAppPasswordHash();
    return {};
  }
  setAppPasswordHash(hashPassword(pw));
  return {};
}

// Verify a password attempt against the stored hash.
export function verifyAppPassword(password: string): boolean {
  if (!appPasswordHashExists()) return true; // no password set -> nothing to verify
  const stored = getAppPasswordHash();
  // File present but unreadable (keyring unavailable): we can't verify, so we
  // refuse to unlock rather than fall open.
  if (!stored) return false;
  return verifyAgainst(stored, password.trim());
}
