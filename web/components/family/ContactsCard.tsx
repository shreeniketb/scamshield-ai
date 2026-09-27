"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { saveSettings } from "@/lib/api";
import type { CircleMember } from "@/lib/types";

export function ContactsCard({ members }: { members: CircleMember[] }) {
  const [rows, setRows] = useState(members);
  const [status, setStatus] = useState<string | null>(null);

  function update(id: string, phone: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, phone } : row)));
  }

  async function save() {
    setStatus("Saving…");
    try {
      await saveSettings({ members: rows });
      setStatus("Saved. Kale’s pop-up can now say “call Kale at …” using these numbers.");
    } catch {
      setStatus("Couldn't save — try again");
    }
  }

  return (
    <div className="space-y-2">
      {rows
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((member) => (
          <Card key={member.id}>
            <p className="font-medium">{member.name}</p>
            <p className="text-sm text-muted">{member.relation}</p>
            <label className="mt-3 block text-sm text-muted" htmlFor={`phone-${member.id}`}>
              Phone number
            </label>
            <input
              id={`phone-${member.id}`}
              type="tel"
              value={member.phone}
              onChange={(event) => update(member.id, event.target.value)}
              placeholder="+1 404 555 0100"
              className="mt-1 min-h-12 w-full rounded-card border border-line bg-surface px-4 text-ink"
            />
          </Card>
        ))}
      <button
        type="button"
        onClick={() => void save()}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-pill bg-brand text-white"
      >
        Save numbers
      </button>
      <p aria-live="polite" className="text-sm text-muted">
        {status}
      </p>
    </div>
  );
}
