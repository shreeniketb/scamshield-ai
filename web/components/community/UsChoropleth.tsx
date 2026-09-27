"use client";

import { useMemo, useRef, useState } from "react";
import { scaleQuantile } from "d3-scale";
import { formatUsdCompact } from "@/lib/data/ic3ElderFraud2025";
import type { StateShape } from "@/lib/usMap";
import type { StateStat } from "@/lib/types";

const TEAL = ["#C5E3DF", "#8FCCC6", "#4E9E96", "#1F6E6A", "#0F5257"];

type Metric = "losses" | "complaints";

type UsChoroplethProps = {
  shapes: StateShape[];
  states: StateStat[];
  metric: Metric;
  pinned: string | null;
  hovered: string | null;
  onHover: (postal: string | null) => void;
  onPin: (postal: string) => void;
};

function metricValue(stat: StateStat | undefined, metric: Metric) {
  if (!stat) return null;
  return metric === "losses" ? stat.losses_usd : stat.complaints;
}

function formatValue(value: number, metric: Metric) {
  return metric === "losses" ? formatUsdCompact(value) : value.toLocaleString("en-US");
}

export function UsChoropleth({
  shapes,
  states,
  metric,
  pinned,
  hovered,
  onHover,
  onPin,
}: UsChoroplethProps) {
  const byPostal = useMemo(() => new Map(states.map((state) => [state.state, state])), [states]);
  const ranked = useMemo(() => {
    return states
      .map((state) => ({
        postal: state.state,
        value: metric === "losses" ? state.losses_usd : state.complaints,
      }))
      .sort((a, b) => b.value - a.value);
  }, [states, metric]);
  const rankOf = useMemo(() => new Map(ranked.map((row, index) => [row.postal, index + 1])), [ranked]);
  const scale = useMemo(() => {
    return scaleQuantile<string>()
      .domain(ranked.map((row) => row.value))
      .range(TEAL);
  }, [ranked]);
  const legend = useMemo(() => {
    if (ranked.length === 0) return [];
    const breaks = [ranked[ranked.length - 1]?.value ?? 0, ...scale.quantiles(), ranked[0]?.value ?? 0];
    return TEAL.map((color, index) => ({
      color,
      label: `${formatValue(breaks[index] ?? 0, metric)}–${formatValue(breaks[index + 1] ?? 0, metric)}`,
    }));
  }, [ranked, scale, metric]);

  const order = useMemo(() => {
    const withData = ranked.map((row) => row.postal);
    const missing = shapes.map((shape) => shape.postal).filter((postal) => !byPostal.has(postal));
    return [...withData, ...missing];
  }, [ranked, shapes, byPostal]);

  const [focus, setFocus] = useState<string | null>(null);
  const refs = useRef<Record<string, SVGPathElement | null>>({});
  const active = hovered ?? focus;

  function move(step: number) {
    if (order.length === 0) return;
    const current = order.indexOf(focus ?? order[0] ?? "");
    const next = order[(Math.max(0, current) + step + order.length) % order.length];
    if (!next) return;
    setFocus(next);
    onHover(next);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div
        className="outline-none"
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
        <svg viewBox="0 0 960 600" className="h-auto w-full" role="img" aria-label="United States elder fraud map">
          <defs>
            <pattern id="no-data-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#E7E1D6" />
              <path d="M0 6 L6 0" stroke="#B7B1A6" strokeWidth="1" />
            </pattern>
          </defs>
          {shapes.map((shape) => {
            const stat = byPostal.get(shape.postal);
            const value = metricValue(stat, metric);
            const filled = value == null ? "url(#no-data-hatch)" : (scale(value) ?? TEAL[0]);
            const hot = shape.postal === pinned || shape.postal === active;
            const tab =
              (focus ?? order[0]) === shape.postal ? 0 : -1;
            return (
              <path
                key={shape.postal}
                ref={(node) => {
                  refs.current[shape.postal] = node;
                }}
                d={shape.d}
                tabIndex={tab}
                role="button"
                aria-label={describe(shape.name, stat, rankOf, metric)}
                aria-pressed={pinned === shape.postal}
                fill={filled}
                stroke={hot ? "#0F5257" : "#ffffff"}
                strokeWidth={hot ? 2 : 0.75}
                className="cursor-pointer outline-none focus-visible:stroke-brand"
                onMouseEnter={() => onHover(shape.postal)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => {
                  setFocus(shape.postal);
                  onHover(shape.postal);
                }}
                onClick={() => onPin(shape.postal)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPin(shape.postal);
                  }
                }}
              />
            );
          })}
        </svg>
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legend">
        {legend.map((item, index) => (
          <li key={`${item.color}-${index}`} className="flex items-center gap-2 text-sm text-ink">
            <span className="inline-block size-4 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
            <span className="tabular-nums">{item.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-ink">
          <span
            className="inline-block size-4 rounded-sm border border-line"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #E7E1D6, #E7E1D6 2px, #B7B1A6 2px, #B7B1A6 3px)",
            }}
            aria-hidden="true"
          />
          No data
        </li>
      </ul>
    </div>
  );
}

function describe(
  name: string,
  stat: StateStat | undefined,
  rankOf: Map<string, number>,
  metric: Metric,
) {
  if (!stat) return `${name}. No 2025 state total in this file.`;
  const rank = rankOf.get(stat.state);
  const value = metric === "losses" ? formatUsdCompact(stat.losses_usd) : stat.complaints.toLocaleString("en-US");
  const unit = metric === "losses" ? "in losses" : "complaints";
  return `${name}, ${value} ${unit}, rank ${rank ?? "unknown"} of ${rankOf.size}. ${stat.losses_usd ? formatUsdCompact(stat.losses_usd) : ""} losses and ${stat.complaints.toLocaleString("en-US")} complaints.`;
}
