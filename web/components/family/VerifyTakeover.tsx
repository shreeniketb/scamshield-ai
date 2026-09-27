"use client";

import { useEffect, useRef, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPendingVerify, respondVerify } from "@/lib/api";
import { subscribeBus } from "@/lib/mock/bus";
import type { VerifyRequest } from "@/lib/types";
import { isThisName } from "@/lib/verifyCopy";

type Phase = "idle" | "ask" | "not_me" | "confirmed" | "expired";

function remainingSeconds(verify: VerifyRequest) {
  return Math.max(0, Math.ceil((Date.parse(verify.expires_at) - Date.now()) / 1000));
}

export function VerifyTakeover({ memberId }: { memberId?: string }) {
  const [verify, setVerify] = useState<VerifyRequest | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(30);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    const apply = (next: VerifyRequest | null) => {
      if (!active || !next || next.status !== "pending") return;
      if (memberId && next.claimed_member_id !== memberId) return;
      if (seenIds.current.has(next.id)) return;
      if (remainingSeconds(next) <= 0) return;
      seenIds.current.add(next.id);
      setVerify(next);
      setPhase("ask");
      setSeconds(remainingSeconds(next));
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }
    };

    const poll = async () => {
      try {
        apply(await getPendingVerify(memberId));
      } catch {
        // Keep polling; a single failed request should not stop the next one.
      }
    };

    void poll();
    const pollId = window.setInterval(() => void poll(), 2000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribeBus((message) => {
      if (message.type === "verify_pending") apply(message.verify);
    });

    return () => {
      active = false;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [memberId]);

  useEffect(() => {
    if (phase !== "ask" || !verify) return;
    const id = window.setInterval(() => {
      const left = remainingSeconds(verify);
      setSeconds(left);
      if (left <= 0) setPhase("expired");
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, verify]);

  if (phase === "idle" || !verify) return null;

  const current = verify;

  async function onNotMe() {
    await respondVerify(current.id, "not_me");
    setPhase("not_me");
  }

  async function onMe() {
    await respondVerify(current.id, "me");
    setPhase("confirmed");
  }

  const ring = Math.round((seconds / 30) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-title"
        className="flex h-full w-full max-w-[480px] flex-col bg-paper px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] shadow-card sm:h-auto sm:rounded-sheet"
      >
        <div className="flex items-center gap-2 text-brand">
          <Shield aria-hidden="true" className="size-6" />
          <span className="text-sm font-medium">ScamShield</span>
        </div>

        {phase === "ask" ? (
          <>
            <h2 id="verify-title" className="mt-6 font-display text-[32px] leading-tight text-ink">
              {isThisName(verify.claimed_member_name)}
            </h2>
            <p className="mt-3 text-[20px] text-ink">{verify.reason}</p>
            <div className="mt-8 flex justify-center">
              <div
                className="flex size-28 items-center justify-center rounded-full border-4 border-brand-soft"
                style={{
                  background: `conic-gradient(var(--brand) ${ring}%, var(--line) 0)`,
                }}
                aria-label={`${seconds} seconds left to answer`}
              >
                <div className="flex size-24 items-center justify-center rounded-full bg-paper">
                  <span className="font-display text-4xl tabular-nums text-ink">{seconds}</span>
                </div>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-3 pt-10">
              <Button
                variant="danger"
                className="min-h-16 text-lg"
                onClick={() => void onNotMe()}
              >
                NOT me — protect Nani
              </Button>
              <Button variant="secondary" className="min-h-14" onClick={() => void onMe()}>
                Yes, it’s me
              </Button>
            </div>
          </>
        ) : null}

        {phase === "not_me" ? (
          <div className="mt-10 space-y-4">
            <h2 id="verify-title" className="font-display text-[32px] text-ink">
              Good call checking.
            </h2>
            <p className="text-[20px] text-ink">Nani has been told to hang up.</p>
            <a
              href="tel:+14045550100"
              className="inline-flex min-h-12 items-center justify-center rounded-pill bg-brand px-5 text-white"
            >
              Call Nani
            </a>
            <Button variant="ghost" onClick={() => setPhase("idle")}>
              Close
            </Button>
          </div>
        ) : null}

        {phase === "confirmed" ? (
          <div className="mt-10 space-y-4">
            <h2 id="verify-title" className="font-display text-[32px] text-ink">
              Thanks — we’ll let Nani know it’s you.
            </h2>
            <Button onClick={() => setPhase("idle")}>Close</Button>
          </div>
        ) : null}

        {phase === "expired" ? (
          <div className="mt-10 space-y-4">
            <h2 id="verify-title" className="font-display text-[32px] text-ink">
              Time ran out
            </h2>
            <p className="text-[20px] text-muted">
              We treated this as unanswered and warned Nani to hang up.
            </p>
            <Button onClick={() => setPhase("idle")}>Close</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
