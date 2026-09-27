"use client";

import { useMemo, useState } from "react";
import { UsChoropleth } from "@/components/community/UsChoropleth";
import { StateTable, type StateTableRow } from "@/components/community/StateTable";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatUsdCompact, ic3StateName } from "@/lib/data/ic3ElderFraud2025";
import type { StateShape } from "@/lib/usMap";
import type { StateStat } from "@/lib/types";

type Metric = "losses" | "complaints";

type NationalPanelProps = {
  shapes: StateShape[];
  states: StateStat[];
};

export function NationalPanel({ shapes, states }: NationalPanelProps) {
  const [metric, setMetric] = useState<Metric>("losses");
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const placeholder = states.some((state) => state.placeholder);

  const ranked = useMemo(() => {
    return [...states].sort((a, b) =>
      metric === "losses" ? b.losses_usd - a.losses_usd : b.complaints - a.complaints,
    );
  }, [states, metric]);

  const share = useMemo(() => {
    const total = ranked.reduce(
      (sum, state) => sum + (metric === "losses" ? state.losses_usd : state.complaints),
      0,
    );
    const top = ranked
      .slice(0, 5)
      .reduce((sum, state) => sum + (metric === "losses" ? state.losses_usd : state.complaints), 0);
    if (total === 0) return 0;
    return Math.round((top / total) * 100);
  }, [ranked, metric]);

  const georgiaIndex = ranked.findIndex((state) => state.state === "GA");
  const georgia = georgiaIndex >= 0 ? ranked[georgiaIndex] : null;
  const title =
    metric === "losses"
      ? `Five states account for ${share}% of reported elder-fraud losses`
      : `Five states account for ${share}% of elder-fraud complaints`;
  const georgiaLine = georgia
    ? `Georgia, where Nani lives, ranks ${georgiaIndex + 1} — ${
        metric === "losses"
          ? `${formatUsdCompact(georgia.losses_usd)} in losses`
          : `${georgia.complaints.toLocaleString("en-US")} complaints`
      } reported by people 60 and older.`
    : "Georgia is not in this file.";

  const rows: StateTableRow[] = ranked.slice(0, 10).map((state, index) => ({
    postal: state.state,
    name: ic3StateName[state.state] ?? state.state,
    losses: state.losses_usd,
    complaints: state.complaints,
    rank: index + 1,
  }));
  if (pinned && !rows.some((row) => row.postal === pinned)) {
    const index = ranked.findIndex((state) => state.state === pinned);
    const state = ranked[index];
    if (state) {
      rows.push({
        postal: state.state,
        name: ic3StateName[state.state] ?? state.state,
        losses: state.losses_usd,
        complaints: state.complaints,
        rank: index + 1,
        outsideTop: true,
      });
    }
  }

  const focusPostal = hovered ?? pinned;
  const focusStat = states.find((state) => state.state === focusPostal);
  const focusName = focusPostal
    ? (ic3StateName[focusPostal] ?? shapes.find((shape) => shape.postal === focusPostal)?.name ?? focusPostal)
    : "";
  const detail = !focusPostal
    ? "Hover a state or use the arrow keys. Click a state to pin it in the table."
    : focusStat
      ? `${focusName}: ${formatUsdCompact(focusStat.losses_usd)} in losses, rank ${lossRank(states, focusPostal)} of ${states.length}. ${focusStat.complaints.toLocaleString("en-US")} complaints, rank ${complaintRank(states, focusPostal)} of ${states.length}.`
      : `${focusName}: no 2025 state total in this file.`;

  function togglePin(postal: string) {
    setPinned((current) => (current === postal ? null : postal));
  }

  return (
    <section className="col-span-12 min-w-0" aria-labelledby="national-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 id="national-heading" className="font-display text-2xl text-ink">
            {title}
          </h2>
          <p className="mt-1 text-muted">{georgiaLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {placeholder ? (
            <span className="inline-flex min-h-8 items-center rounded-pill bg-attention-soft px-3 text-sm font-medium text-attention">
              Placeholder figures
            </span>
          ) : null}
          <SegmentedControl
            label="National map values"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "losses", label: "Losses ($)" },
              { value: "complaints", label: "Complaints" },
            ]}
          />
        </div>
      </div>
      <p className="mt-3 min-h-12 text-ink" aria-live="polite">
        {detail}
      </p>
      {ranked.length === 0 ? (
        <Card>
          <EmptyState title="National figures didn’t load" body="The state table will appear when the IC3 file is available." />
        </Card>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-7">
            <Card>
              <UsChoropleth
                shapes={shapes}
                states={states}
                metric={metric}
                pinned={pinned}
                hovered={hovered}
                onHover={setHovered}
                onPin={togglePin}
              />
              <p className="mt-3 text-sm text-muted">
                FBI IC3 2025 Elder Fraud Report. Full-year totals for people 60 and older — they stay put when the
                Atlanta range changes.
                {placeholder ? " Placeholder figures, to be replaced with IC3 2025." : " These are the published state totals, not Atlanta demo data."}
              </p>
            </Card>
          </div>
          <div className="min-w-0 xl:col-span-5">
            <Card>
              <h3 className="font-display text-xl text-ink">Top 10 states</h3>
              <p className="mt-1 mb-3 text-sm text-muted">
                {metric === "losses" ? "Sorted by dollars lost." : "Sorted by complaints filed."} Click a row to pin it
                on the map.
              </p>
              <StateTable
                rows={rows}
                metric={metric}
                pinned={pinned}
                hovered={hovered}
                onSelect={togglePin}
                onHover={setHovered}
              />
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}

function lossRank(states: StateStat[], postal: string) {
  const ordered = [...states].sort((a, b) => b.losses_usd - a.losses_usd);
  return ordered.findIndex((state) => state.state === postal) + 1;
}

function complaintRank(states: StateStat[], postal: string) {
  const ordered = [...states].sort((a, b) => b.complaints - a.complaints);
  return ordered.findIndex((state) => state.state === postal) + 1;
}
