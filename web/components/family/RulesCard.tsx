"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { saveSettings } from "@/lib/api";
import type { CircleRules } from "@/lib/types";

const RULES = [
  {
    key: "claims_family",
    label: "A caller says they're family",
    hint: "“Grandma, it's me…” from any number.",
  },
  {
    key: "unknown_caller_asks_money",
    label: "An unknown number asks for money",
    hint: "Bail, gift cards, wire transfers or crypto.",
  },
  {
    key: "voice_clone_score_above_0.7",
    label: "The voice sounds computer-generated",
    hint: "ScamShield thinks the voice may be an AI copy.",
  },
];

const WAIT_OPTIONS = [15, 30, 60];

export function RulesCard({ rules }: { rules: CircleRules }) {
  const [enabled, setEnabled] = useState<string[]>(rules.prompt_safe_word_when);
  const [wait, setWait] = useState(rules.verify_timeout_s);
  const [status, setStatus] = useState<string | null>(null);

  async function save(next: Partial<CircleRules>) {
    setStatus("Saving…");
    try {
      await saveSettings({ rules: { ...rules, prompt_safe_word_when: enabled, verify_timeout_s: wait, ...next } });
      setStatus("Saved");
    } catch {
      setStatus("Couldn't save — try again");
    }
  }

  function toggle(key: string) {
    const next = enabled.includes(key) ? enabled.filter((item) => item !== key) : [...enabled, key];
    setEnabled(next);
    void save({ prompt_safe_word_when: next });
  }

  function chooseWait(seconds: number) {
    setWait(seconds);
    void save({ verify_timeout_s: seconds });
  }

  return (
    <Card>
      <p className="text-lg font-medium text-ink">Ask the caller for the safe word when…</p>
      <ul className="mt-3 divide-y divide-line">
        {RULES.map((rule) => {
          const on = enabled.includes(rule.key);
          return (
            <li key={rule.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(rule.key)}
                className="flex min-h-16 w-full items-center gap-4 py-3 text-left"
              >
                <span className="flex-1">
                  <span className="block text-ink">{rule.label}</span>
                  <span className="block text-sm text-muted">{rule.hint}</span>
                </span>
                <span className="text-sm font-medium text-muted">{on ? "On" : "Off"}</span>
                <span
                  aria-hidden="true"
                  className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-200 ${on ? "bg-brand" : "bg-line"}`}
                >
                  <span
                    className={`absolute top-1 size-5 rounded-pill bg-surface shadow-card transition-transform duration-200 ${on ? "translate-x-6" : "translate-x-1"}`}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 border-t border-line pt-5">
        <p id="wait-label" className="text-ink">
          How long to wait for family to answer “Is this you?”
        </p>
        <p className="text-sm text-muted">If nobody answers in time, Nani is told to hang up.</p>
        <div role="radiogroup" aria-labelledby="wait-label" className="mt-3 grid grid-cols-3 gap-1 rounded-pill bg-paper p-1">
          {WAIT_OPTIONS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={wait === seconds}
              onClick={() => chooseWait(seconds)}
              className={`min-h-12 rounded-pill text-base font-medium tabular-nums transition-colors duration-200 ${
                wait === seconds ? "bg-surface text-brand shadow-card" : "text-muted"
              }`}
            >
              {seconds} s
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
        {status}
      </p>
    </Card>
  );
}
