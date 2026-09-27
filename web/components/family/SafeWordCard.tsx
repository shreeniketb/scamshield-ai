"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { Toast } from "@/components/ui/Toast";
import { setSafeWord } from "@/lib/api";

type Props = {
  safeWordSet: boolean;
  lastUsedAt: string | null;
  lastResult: "passed" | "failed" | null;
};

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function lastUsedLine(lastUsedAt: string | null, lastResult: Props["lastResult"]) {
  if (!lastUsedAt || !lastResult) return "Not asked on a call yet.";
  const outcome = lastResult === "passed" ? "the caller knew it" : "the caller couldn't give it";
  return `Asked on a call ${daysAgo(lastUsedAt)} — ${outcome}.`;
}

export function SafeWordCard({ safeWordSet, lastUsedAt, lastResult }: Props) {
  const router = useRouter();
  const [isSet, setIsSet] = useState(safeWordSet);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function openSheet() {
    setWord("");
    setConfirm("");
    setError(null);
    setOpen(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = word.trim();
    if (trimmed.length < 2) return setError("Use at least 2 letters.");
    if (trimmed.toLowerCase() !== confirm.trim().toLowerCase()) {
      return setError("The two entries don't match yet.");
    }
    setSaving(true);
    try {
      await setSafeWord(trimmed);
      setIsSet(true);
      setOpen(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't save right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      {isSet ? (
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-safe-soft text-safe">
            <Lock aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-medium text-ink">
              Safe word is set <span aria-hidden="true" className="tracking-widest text-muted">••••</span>
            </p>
            <p className="mt-1 text-muted">{lastUsedLine(lastUsedAt, lastResult)}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-attention-soft text-attention">
            <KeyRound aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-lg font-medium text-ink">Pick a family safe word</p>
            <p className="mt-1 text-muted">
              A word only your family knows. If a caller sounds like family but can&apos;t say it, Nani hangs up.
              AI can copy a voice — it can&apos;t guess your word.
            </p>
          </div>
        </div>
      )}

      <Button variant={isSet ? "secondary" : "primary"} className="mt-5 w-full" onClick={openSheet}>
        {isSet ? "Change safe word" : "Set safe word"}
      </Button>

      {saved ? (
        <div className="mt-4">
          <Toast
            tone="safe"
            message="Saved. Tell family the word in person or on a call — never by text."
            onDismiss={() => setSaved(false)}
          />
        </div>
      ) : null}

      <Sheet open={open} title={isSet ? "Change safe word" : "Set a safe word"} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-muted">
            {isSet
              ? "The new word replaces the old one straight away. Nani's app will ask callers for the new word."
              : "Choose something easy for Nani to remember but hard to guess — not a pet's name or birthday."}
          </p>
          <label className="block">
            <span className="text-sm font-medium text-ink">Safe word</span>
            <input
              type="password"
              autoComplete="off"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-card border border-line bg-surface px-4 text-lg text-ink"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Type it again</span>
            <input
              type="password"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-card border border-line bg-surface px-4 text-lg text-ink"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-critical">
              {error}
            </p>
          ) : null}
          <p className="text-sm text-muted">We never show the word again after you save it.</p>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : "Save safe word"}
          </Button>
        </form>
      </Sheet>
    </Card>
  );
}
