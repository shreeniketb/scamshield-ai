"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { triggerVoiceCloneVerify } from "@/lib/api";

export default function DemoPage() {
  const [log, setLog] = useState<string[]>([]);

  function trigger() {
    try {
      const verify = triggerVoiceCloneVerify();
      setLog((prev) => [
        `${new Date().toLocaleTimeString()} · verify ${verify.id} sent to Aarav`,
        ...prev,
      ]);
    } catch (error) {
      setLog((prev) => [`Trigger failed: ${String(error)}`, ...prev]);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 space-y-6">
      <p className="text-sm text-muted">
        <Link href="/" className="text-brand">
          ScamShield
        </Link>{" "}
        · Demo control room · mock mode
      </p>
      <h1 className="font-display text-3xl">Demo</h1>
      <p className="text-muted">
        Open the family app in another tab, then trigger the voice-clone call.
      </p>
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-2">
          <h2 className="font-display text-xl">Phone preview</h2>
          <p className="mt-2 text-muted">iPhone frame in a later phase. Use a real second tab for now.</p>
          <Link href="/family" className="mt-3 inline-flex min-h-12 items-center text-brand">
            Open /family
          </Link>
        </Card>
        <Card className="md:col-span-3">
          <h2 className="font-display text-xl">Scenario</h2>
          <Button className="mt-4" onClick={trigger}>
            2 · Voice-clone grandson call
          </Button>
          <h3 className="mt-6 font-display text-lg">Event log</h3>
          <ul className="mt-2 font-mono text-sm">
            {log.length ? log.map((line) => <li key={line}>{line}</li>) : <li>Waiting…</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
