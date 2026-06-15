"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui";
import { signOut } from "@/app/actions";
import { hasUnsentChanges, revertUnsentChanges } from "@/app/(app)/schedule/drafts";

// Sign out, but first warn if there are unsent edits to an already-published
// day — confirming discards them (reverts to the last sent version) before
// signing out. Never-published drafts are unaffected and survive.
export default function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

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

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-60"
      >
        Sign out
      </button>

      {confirming && (
        <ConfirmDialog
          title="You have unsent changes"
          message="Some changes to an already-sent day haven't been published. If you sign out now they'll be discarded and that day goes back to what was last sent. Sign out anyway?"
          confirmLabel="Discard and sign out"
          cancelLabel="Keep editing"
          tone="danger"
          onConfirm={discardAndSignOut}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
