"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

type SparklineProps = {
  data: number[];
  color?: string;
};

export function Sparkline({ data, color = "#0072B2" }: SparklineProps) {
  const points = data.map((value, index) => ({ index, value }));

  return (
    <div className="h-10 w-28" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
