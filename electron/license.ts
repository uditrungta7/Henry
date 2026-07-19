// License client. The license authority is a server WE host (a Supabase Edge
// Function + licenses table), built and deployed separately. This file is ONLY
// the client: it derives a stable per-machine license_id, checks the configured
// endpoint at most once a day, caches the result, and computes the launch gate.
//
// Defaults: with NO license_endpoint configured, the app stays UNLOCKED (so it's
// fully usable in development and when transported). With an endpoint, the server
// auto-registers an unlocked trial on first contact, so a fresh install just works.

import { createHash } from "node:crypto";
import { app } from "electron";
import { machineIdSync } from "node-machine-id";
import { getDatabase } from "./db";
import { clearAppPasswordHash } from "./secrets";

// The license server every PACKAGED copy checks by default, so a downloaded
// installer starts its trial with no per-machine setup. Development (unpackaged)
// stays unlocked unless an endpoint is set explicitly via the script; the script
// can still override (or with "" reset to this default) on any machine.
const DEFAULT_ENDPOINT =
  "https://xwgoocwgvacmovnbbccl.supabase.co/functions/v1/check-license";

// The endpoint to use: the explicit setting if present, else the baked-in
// default when running as a packaged app, else none (dev -> unlocked).
function licenseEndpoint(): string | null {
  return get(K.endpoint) || (app.isPackaged ? DEFAULT_ENDPOINT : null);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = 14 * ONE_DAY_MS; // offline grace window

// Settings keys used for the license.
const K = {
  id: "license_id",
  endpoint: "license_endpoint",
  valid: "license_valid",
  isLicensed: "is_licensed",
  trialEndsAt: "trial_ends_at",
  lastChecked: "license_last_checked",
  companyName: "company_name",
};

function get(key: string): string | null {
  const row = getDatabase().prepare("select value from settings where key=?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

function set(key: string, value: string): void {
  getDatabase()
    .prepare(
      "insert into settings (key, value) values (?, ?) on conflict(key) do update set value=excluded.value"
    )
    .run(key, value);
}

// A stable id for this install: a hash of the OS machine id, so reinstalling on
// the same computer maps back to the same license. Created once, then persisted.
export function ensureLicenseId(): string {
  const existing = get(K.id);
  if (existing) return existing;
  let raw: string;
  try {
    raw = machineIdSync(true);
  } catch {
    // Extremely rare; fall back to a random-but-persisted id so the app still runs.
    raw = createHash("sha256").update(String(Math.random())).digest("hex");
  }
  const id = createHash("sha256").update("henry:" + raw).digest("hex");
  set(K.id, id);
  return id;
}

export type CheckResponse = {
  valid: boolean;
  is_licensed: boolean;
  trial_ends_at: string | null;
  revoked: boolean;
  company_name: string | null;
  reset_password?: boolean;
};

// POST to the configured endpoint. Caches the result. Network failures are
// swallowed (offline grace handles them). No-op if no endpoint is set.
//
// Concurrent calls share one request, and a check that finished moments ago
// counts as fresh even when forced — so the gate can warm the verdict in the
// background while the user types their password, and the post-unlock check
// returns instantly instead of hitting the network again.
const FRESH_MS = 30 * 1000;
let inFlightCheck: Promise<void> | null = null;

export function checkLicenseIfDue(force = false): Promise<void> {
  if (inFlightCheck) return inFlightCheck; // join the check already running
  const p = doCheck(force).finally(() => {
    inFlightCheck = null;
  });
  inFlightCheck = p;
  return p;
}

async function doCheck(force: boolean): Promise<void> {
  const endpoint = licenseEndpoint();
  if (!endpoint) return; // unconfigured -> default unlocked, nothing to check

  const last = get(K.lastChecked);
  if (last) {
    const age = Date.now() - new Date(last).getTime();
    // Forced: only skip if checked seconds ago. Unforced: daily throttle.
    if (Number.isFinite(age) && age < (force ? FRESH_MS : ONE_DAY_MS)) return;
  }

  const licenseId = ensureLicenseId();
  // Blank means "no name yet" — send null, never "", so the server can tell a
  // real name from an unset one (and won't store an empty string it can't replace).
  const companyHint = (get(K.companyName) || "").trim() || null;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_id: licenseId, company_hint: companyHint }),
      // Cap the wait so a slow network can't hang the launch gate; a timeout is
      // treated like any other network failure (cached verdict + grace apply).
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return; // treat as unreachable; grace handles it
    const data = (await res.json()) as CheckResponse;

    set(K.valid, data.valid ? "1" : "0");
    set(K.isLicensed, data.is_licensed ? "1" : "0");
    set(K.trialEndsAt, data.trial_ends_at ?? "");
    set(K.lastChecked, new Date().toISOString());
    // Fill the company name from the server if we didn't have one.
    if (data.company_name && !companyHint) set(K.companyName, data.company_name);
    // Remote password reset: the owner flipped the flag in the dashboard because
    // the customer is locked out. Clear the local password; the lock screen is
    // gone on the next gate evaluation and they can set a fresh one in Settings.
    if (data.reset_password) clearAppPasswordHash();
  } catch {
    // Offline / network error: keep the cached result; grace window applies.
  }
}

export type LicenseGate =
  | { license: "ok" }
  | { license: "ended" } // valid=false (trial expired or revoked)
  | { license: "verify-needed" }; // offline too long to trust the cache

// Compute the license verdict from cached settings.
//  - No endpoint configured            -> ok (unlocked; dev/transport).
//  - Never successfully checked yet     -> verify-needed (the gate awaits a live
//                                          check first, so this only shows when
//                                          the server is unreachable — otherwise
//                                          wiping AppData + blocking the network
//                                          would stay unlocked forever).
//  - Cached valid = true                -> ok.
//  - Cached valid = false               -> ended.
//  - Cached valid true but stale beyond -> verify-needed.
//    the 14-day grace since last check
export function getLicenseGate(): LicenseGate {
  const endpoint = licenseEndpoint();
  if (!endpoint) return { license: "ok" };

  const valid = get(K.valid);
  const last = get(K.lastChecked);

  // No successful check on record yet: require one before the app opens.
  if (valid === null || !last) return { license: "verify-needed" };

  if (valid !== "1") return { license: "ended" };

  // valid=true but possibly stale: enforce the offline grace window.
  const age = Date.now() - new Date(last).getTime();
  if (Number.isFinite(age) && age > GRACE_MS) return { license: "verify-needed" };

  return { license: "ok" };
}

// Small status object for any UI that wants to show trial/license details.
// licenseId is included so the owner can read it to us when activating.
export function getLicenseStatus() {
  return {
    endpointConfigured: !!licenseEndpoint(),
    valid: get(K.valid) === "1",
    isLicensed: get(K.isLicensed) === "1",
    trialEndsAt: get(K.trialEndsAt) || null,
    lastChecked: get(K.lastChecked) || null,
    licenseId: ensureLicenseId(),
  };
}
