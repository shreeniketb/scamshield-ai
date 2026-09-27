"use client";

import { Bar, BarChart, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";
import type { CircleHealthWeek } from "@/lib/types";

type Props = {
  weeks: CircleHealthWeek[];
  lastContactDays: number;
};

// W1 is the oldest week, the last entry is this week.
function weekName(index: number, total: number) {
  const back = total - 1 - index;
  return back === 0 ? "Now" : `${back}w`;
}

export function CircleHealthChart({ weeks, lastContactDays }: Props) {
  const data = weeks.map((week, index) => ({ name: weekName(index, weeks.length), calls: week.calls }));
  const weeksWithCall = weeks.filter((week) => week.calls >= 1).length;
  const title = `Family called Nani in ${weeksWithCall} of the last ${weeks.length} weeks`;

  return (
    <Card>
      <p className="text-lg font-medium text-ink">{title}</p>
      <p className="text-sm text-muted">Calls per week, oldest on the left. Dashed line = goal of 1 call a week.</p>

      <div
        className="mt-4 h-40"
        role="img"
        aria-label={`${title}. Weekly calls, oldest first: ${weeks.map((week) => week.calls).join(", ")}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              tick={{ fill: "var(--muted)", fontSize: 13 }}
              interval={0}
            />
            <YAxis hide allowDecimals={false} domain={[0, "dataMax + 1"]} />
            <ReferenceLine y={1} stroke="var(--muted)" strokeDasharray="4 4" />
            <Bar dataKey="calls" fill="var(--brand)" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="calls" position="top" fill="var(--ink)" fontSize={13} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {lastContactDays >= 4 ? (
        <p className="mt-4 rounded-card bg-attention-soft px-4 py-3 text-attention">
          It&apos;s been {lastContactDays} days since anyone called Nani. Scammers target people who feel alone — a
          5-minute call helps.
        </p>
      ) : (
        <p className="mt-4 rounded-card bg-safe-soft px-4 py-3 text-safe">
          Someone called Nani in the last few days. Regular calls make scams far less likely to work.
        </p>
      )}
    </Card>
  );
}
