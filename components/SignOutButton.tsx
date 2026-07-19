"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui";
import { signOut } from "@/app/actions";
import { hasUnsentChanges, revertUnsentChanges } from "@/app/(app)/schedule/drafts";
import { henry, isElectron, onDataChanged } from "@/lib/ipc/client";

// "Lock" returns the app to the password screen. It only appears when a local
// app password is set (otherwise there's nothing to lock to). Before locking it
// warns if there are unsent edits to an already-published day; confirming
// discards them (reverts to the last sent version). Never-published drafts survive.
export default function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    if (!isElectron()) return;
    const check = () => henry().auth.hasPassword().then(setHasPassword);
    check();
    // Re-check when the password is set/removed in Settings.
    return onDataChanged(check);
  }, []);

  function handleClick() {
    startTransition(async () => {
      if (await hasUnsentChanges()) {
        setConfirming(true);
      } else {
        await signOut();
      }
    });
  }

  function discardAndSignOut() {
    startTransition(async () => {
      await revertUnsentChanges();
      await signOut();
    });
  }

  // Nothing to lock to without a password.
  if (!hasPassword) return null;

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-60"
      >
        Lock
      </button>

      {confirming && (
        <ConfirmDialog
          title="You have unsent changes"
          message="Some changes to an already-sent day haven't been published. If you lock now they'll be discarded and that day goes back to what was last sent. Lock anyway?"
          confirmLabel="Discard and lock"
          cancelLabel="Keep editing"
          tone="danger"
          onConfirm={discardAndSignOut}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
