// OS-encrypted secret storage via Electron safeStorage. Secrets NEVER touch the
// SQLite settings table. We persist the encrypted blobs as files in userData;
// only this machine's logged-in OS user can decrypt them.
//
// Holds: the SMTP password (Phase 3) and the optional local app-password hash
// (Phase 4). safeStorage requires the app to be ready before use.

import path from "node:path";
import fs from "node:fs";
import { app, safeStorage } from "electron";

function secretPath(name: string): string {
  return path.join(app.getPath("userData"), `${name}.bin`);
}

function writeSecret(name: string, plaintext: string): void {
  // OS-level encryption must be available or we'd write an unencrypted (or
  // undecryptable) blob. On macOS/Windows it always is; on a misconfigured Linux
  // without a keyring it may not be. Fail loudly rather than store a secret unsafely.
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "This computer can't securely store the password. Its OS keychain/keyring isn't available."
    );
  }
  const enc = safeStorage.encryptString(plaintext);
  fs.writeFileSync(secretPath(name), enc);
}

function readSecret(name: string): string | null {
  const file = secretPath(name);
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function clearSecret(name: string): void {
  const file = secretPath(name);
  if (fs.existsSync(file)) fs.rmSync(file);
}

// --- SMTP password (Phase 3) ---
export function setSmtpPassword(password: string): void {
  writeSecret("smtp_password", password);
}
export function getSmtpPassword(): string | null {
  return readSecret("smtp_password");
}
export function clearSmtpPassword(): void {
  clearSecret("smtp_password");
}

// --- Local app password hash (Phase 4) ---
export function setAppPasswordHash(hash: string): void {
  writeSecret("app_password_hash", hash);
}
export function getAppPasswordHash(): string | null {
  return readSecret("app_password_hash");
}
export function clearAppPasswordHash(): void {
  clearSecret("app_password_hash");
}
// Whether the hash file is present, regardless of whether it can be decrypted.
// Lets the auth layer fail CLOSED: a hash that exists but is currently
// undecryptable (OS keyring unavailable) must keep the app locked, not fall open.
export function appPasswordHashExists(): boolean {
  return fs.existsSync(secretPath("app_password_hash"));
}
