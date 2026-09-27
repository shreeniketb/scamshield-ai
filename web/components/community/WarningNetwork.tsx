"use client";

import { useMemo, useState } from "react";
import type { WarningNetwork as WarningNetworkData } from "@/lib/types";

const STATUS = {
  first: { fill: "#0F5257", label: "First report" },
  warned: { fill: "#0F5257", label: "Warned automatically" },
  before: { fill: "#009E73", label: "Warned before the scam" },
  after: { fill: "#E69F00", label: "Warned after exposure" },
  outside: { fill: "#C5C0B6", label: "Outside ScamShield" },
} as const;

type WarningNetworkProps = {
  network: WarningNetworkData;
};

export function WarningNetwork({ network }: WarningNetworkProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const layout = useMemo(() => buildLayout(network), [network]);
  const active = network.nodes.find((node) => node.id === activeId) ?? null;
  const counts = {
    first: network.nodes.filter((node) => node.status === "first").length,
    warned: network.nodes.filter((node) => node.status === "warned").length,
    before: network.nodes.filter((node) => node.status === "before").length,
    after: network.nodes.filter((node) => node.status === "after").length,
    outside: network.nodes.filter((node) => node.status === "outside").length,
  };
  const summary = `${network.insight} ${counts.warned} circles warned automatically, ${counts.before} warned before exposure, ${counts.after} warned after, ${counts.outside} outside ScamShield.`;

  function move(step: number) {
    const ids = network.nodes.map((node) => node.id);
    const index = Math.max(0, ids.indexOf(activeId ?? ids[0] ?? ""));
    const next = ids[(index + step + ids.length) % ids.length];
    if (next) setActiveId(next);
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_13.5rem]">
      <div
        tabIndex={0}
        role="application"
        aria-label={`${summary} Arrow keys move between circles.`}
        className="rounded-[12px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        <svg viewBox="0 0 560 450" className="h-auto w-full" role="img" aria-label={summary}>
          {network.edges.map((edge, index) => {
            const from = layout.get(edge.from);
            const to = layout.get(edge.to);
            if (!from || !to) return null;
            return (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                d={curve(from, to)}
                pathLength={1}
                className="warn-edge"
                style={{ animationDelay: `${index * 12}ms` }}
                fill="none"
                stroke="#D9D3C7"
                strokeWidth={1.25}
              />
            );
          })}
          {network.nodes.map((node) => {
            const point = layout.get(node.id);
            if (!point) return null;
            const style = STATUS[node.status];
            const radius = node.status === "first" ? 16 : node.ring === 1 ? 8 : 6;
            const on = activeId === node.id;
            return (
              <g
                key={node.id}
                onMouseEnter={() => setActiveId(node.id)}
                onMouseLeave={() => setActiveId((current) => (current === node.id ? null : current))}
              >
                <circle cx={point.x} cy={point.y} r={14} fill="transparent" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={on ? radius + 2 : radius}
                  fill={style.fill}
                  stroke={on || node.status === "first" ? "#ffffff" : "none"}
                  strokeWidth={node.status === "first" ? 3 : 2}
                />
                <title>{node.label}</title>
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <ul className="space-y-3" aria-label="Warning legend">
          {(
            [
              ["first", counts.first],
              ["warned", counts.warned],
              ["before", counts.before],
              ["after", counts.after],
              ["outside", counts.outside],
            ] as const
          ).map(([status, count]) => (
            <li key={status} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ background: STATUS[status].fill }}
                aria-hidden="true"
              />
              <span className="text-ink">
                {STATUS[status].label}
                <span className="ml-1 tabular-nums text-muted">{count}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-card bg-brand-soft px-3 py-3 text-brand">{network.insight}</p>
        <p className="mt-3 min-h-12 text-sm text-muted" aria-live="polite">
          {active ? active.label : "Hover a circle, or use the arrow keys."}
        </p>
      </div>
    </div>
  );
}

function buildLayout(network: WarningNetworkData) {
  const positions = new Map<string, { x: number; y: number }>();
  const center = { x: 270, y: 220 };
  const rings: Record<0 | 1 | 2, typeof network.nodes> = { 0: [], 1: [], 2: [] };
  network.nodes.forEach((node) => {
    rings[node.ring].push(node);
  });
  rings[0].forEach((node) => positions.set(node.id, center));
  place(rings[1], 118, center, positions);
  place(rings[2], 190, center, positions);
  return positions;
}

function place(
  nodes: { id: string }[],
  radius: number,
  center: { x: number; y: number },
  positions: Map<string, { x: number; y: number }>,
) {
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    positions.set(node.id, {
      x: round(center.x + Math.cos(angle) * radius),
      y: round(center.y + Math.sin(angle) * radius),
    });
  });
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function curve(from: { x: number; y: number }, to: { x: number; y: number }) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = 12;
  const x = round(midX + (-dy / length) * bend);
  const y = round(midY + (dx / length) * bend);
  return `M ${from.x} ${from.y} Q ${x} ${y} ${to.x} ${to.y}`;
}
