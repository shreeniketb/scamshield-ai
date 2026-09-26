import { Sparkline } from "./Sparkline";

type StatTileProps = {
  label: string;
  value: string;
  sparkline?: number[];
};

export function StatTile({ label, value, sparkline }: StatTileProps) {
  return (
    <div className="rounded-card bg-surface p-5 shadow-card md:p-6">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-display text-[40px] leading-none tabular-nums text-ink md:text-[56px]">
          {value}
        </p>
        {sparkline ? <Sparkline data={sparkline} /> : null}
      </div>
    </div>
  );
}
