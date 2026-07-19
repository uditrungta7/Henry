"use client";

// Settings → License: plain-language license status plus this computer's
// license ID (what the owner reads to us when buying or moving a license),
// and a "check again" button that re-contacts the license server.

import { useCallback, useState } from "react";
import { Button, StatusBadge, LoadError } from "@/components/ui";
import { henry, isElectron } from "@/lib/ipc/client";
import { useData } from "@/lib/ipc/useData";
import { formatUsDate } from "@/lib/dates";

export default function LicenseClient() {
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => henry().gate.status(), []);
  const { data: status, loading, error, reload } = useData(load, "license");

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!isElectron() || loading || !status) {
    return <p className="text-slate-500">Loading...</p>;
  }

  async function checkNow() {
    setChecking(true);
    await henry().gate.recheck();
    reload();
    setChecking(false);
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(status!.licenseId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked/unavailable: the ID is on screen to copy by hand, so
      // just don't show the confirmation rather than throwing in the handler.
    }
  }

  let line: React.ReactNode;
  let tone: string;
  if (!status.endpointConfigured) {
    tone = "sent";
    line = "This copy of Henry is fully unlocked. No license check is set up.";
  } else if (status.isLicensed && status.valid) {
    tone = "sent";
    line = "Henry is licensed on this computer. You're all set.";
  } else if (status.valid && status.trialEndsAt) {
    tone = "skipped";
    line = `You're on a free trial until ${formatUsDate(status.trialEndsAt.slice(0, 10))}. Contact us any time to buy a license.`;
  } else if (status.valid) {
    tone = "sent";
    line = "Henry is active on this computer.";
  } else {
    tone = "failed";
    line = "Your license has ended. Contact us to renew it and keep going.";
  }

  return (
    <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <StatusBadge tone={tone}>
          {tone === "failed" ? "Ended" : tone === "skipped" ? "Trial" : "OK"}
        </StatusBadge>
        <p className="text-slate-700">{line}</p>
      </div>

      <div>
        <p className="mb-1 font-medium text-slate-700">This computer&apos;s license ID</p>
        <p className="mb-2 text-sm text-slate-500">
          If you call or write to us about your license, this ID tells us which
          computer is yours.
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
            {status.licenseId}
          </code>
          <Button size="sm" variant="secondary" onClick={copyId}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>

      {status.endpointConfigured && (
        <div className="flex items-center gap-3">
          <Button variant="secondary" disabled={checking} onClick={checkNow}>
            {checking ? "Checking..." : "Check again now"}
          </Button>
          {status.lastChecked && (
            <span className="text-sm text-slate-500">
              Last checked {formatUsDate(status.lastChecked.slice(0, 10))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
