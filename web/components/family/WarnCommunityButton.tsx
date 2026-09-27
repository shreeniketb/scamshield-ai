"use client";

import { useState } from "react";
import { warnCommunity } from "@/lib/api";

const actionClass =
  "inline-flex h-full min-h-12 w-full items-center justify-center rounded-card bg-brand-soft text-brand";

export function WarnCommunityButton({ callId }: { callId: string | null }) {
  const [status, setStatus] = useState<string | null>(null);

  async function warn() {
    if (!callId) {
      setStatus("No live call to share yet.");
      return;
    }
    setStatus("Creating campaign…");
    try {
      await warnCommunity(callId);
      setStatus("Community campaign created from this call.");
    } catch {
      setStatus("Couldn't create the campaign — try again.");
    }
  }

  return (
    <>
      <button type="button" onClick={() => void warn()} className={actionClass}>
        Warn Community
      </button>
      {status ? (
        <p className="col-span-2 text-sm text-muted" aria-live="polite">
          {status}
        </p>
      ) : null}
    </>
  );
}
