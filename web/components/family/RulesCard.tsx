"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { saveSettings } from "@/lib/api";
import type { CircleRules, ProtectionMethod } from "@/lib/types";

export function RulesCard({ rules }: { rules: CircleRules }) {
  const [method, setMethod] = useState<ProtectionMethod>(rules.protection_method ?? "verify_member");
  const [status, setStatus] = useState<string | null>(null);

  async function choose(next: ProtectionMethod) {
    setMethod(next);
    setStatus("Saving…");
    try {
      await saveSettings({ rules: { ...rules, protection_method: next } });
      setStatus("Saved");
    } catch {
      setStatus("Couldn't save — try again");
    }
  }

  return (
    <Card>
      <p className="text-lg font-medium text-ink">When a call looks risky, do one thing</p>
      <p className="mt-1 text-sm text-muted">Pick safe word or “Is this you?” — not both.</p>
      <div role="radiogroup" className="mt-4 space-y-2">
        <button
          type="button"
          role="radio"
          aria-checked={method === "safe_word"}
          onClick={() => choose("safe_word")}
          className={`flex min-h-16 w-full flex-col rounded-card px-4 py-3 text-left ${
            method === "safe_word" ? "bg-brand-soft text-ink" : "bg-paper text-muted"
          }`}
        >
          <span className="font-medium text-ink">Ask for the family safe word</span>
          <span className="text-sm">Nani’s pop-up tells her to ask the caller for the word.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={method === "verify_member"}
          onClick={() => choose("verify_member")}
          className={`flex min-h-16 w-full flex-col rounded-card px-4 py-3 text-left ${
            method === "verify_member" ? "bg-brand-soft text-ink" : "bg-paper text-muted"
          }`}
        >
          <span className="font-medium text-ink">Ask family “Is this you?”</span>
          <span className="text-sm">Kale or Vanessa get a prompt on their phone.</span>
        </button>
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
        {status}
      </p>
    </Card>
  );
}
