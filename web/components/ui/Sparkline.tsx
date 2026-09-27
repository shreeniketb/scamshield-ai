type SparklineProps = {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showValue?: boolean;
  valueLabel?: string;
};

export function Sparkline({
  data,
  color = "#0072B2",
  width = 112,
  height = 40,
  showValue = false,
  valueLabel,
}: SparklineProps) {
  const values = (data.length > 0 ? data : [0]).slice(-24);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padTop = showValue ? 16 : 6;
  const padBottom = 6;
  const padX = 6;
  const points = values.map((value, index) => {
    const x =
      values.length === 1 ? width / 2 : padX + (index / (values.length - 1)) * (width - padX * 2);
    const y = height - padBottom - ((value - min) / span) * (height - padTop - padBottom);
    return { x, y, value };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const label = valueLabel ?? String(Math.round(last?.value ?? 0));
  const anchor = last && last.x > width - 36 ? "end" : "start";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {last ? <circle cx={last.x} cy={last.y} r={3} fill={color} stroke="#ffffff" strokeWidth={1.5} /> : null}
      {showValue && last ? (
        <text
          x={last.x}
          y={11}
          textAnchor={anchor}
          fill={color}
          fontSize={11}
          className="tabular-nums"
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}
