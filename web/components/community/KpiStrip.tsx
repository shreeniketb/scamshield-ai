import { Sparkline } from "@/components/ui/Sparkline";
import type { KpiTile } from "@/lib/communityView";

const directionStyle = {
  up: { symbol: "▲", word: "Up", className: "text-safe" },
  down: { symbol: "▼", word: "Down", className: "text-attention" },
  flat: { symbol: "–", word: "No change", className: "text-muted" },
} as const;

function Tile({ tile }: { tile: KpiTile }) {
  const direction = directionStyle[tile.direction];
  return (
    <article
      aria-label={tile.spoken}
      className={`flex h-full flex-col rounded-card p-5 shadow-card md:p-6 ${
        tile.hero ? "bg-brand-soft md:col-span-2 xl:col-span-2" : "bg-surface"
      }`}
    >
      <h3 className={`font-medium text-ink ${tile.hero ? "text-lg" : "text-base"}`}>{tile.label}</h3>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p
          className={`font-display tabular-nums leading-none text-ink ${
            tile.hero ? "text-[48px] xl:text-[56px]" : "text-[40px]"
          }`}
        >
          {tile.value}
        </p>
        <Sparkline
          data={tile.spark}
          color={tile.hero ? "#0F5257" : "#0072B2"}
          width={tile.hero ? 132 : 112}
          height={48}
          showValue
          valueLabel={tile.sparkLabel}
        />
      </div>
      <p className={`mt-3 text-base font-medium tabular-nums ${direction.className}`}>
        <span aria-hidden="true">
          {direction.symbol} {tile.delta}
        </span>
        <span className="sr-only">
          {direction.word} {tile.delta}
        </span>
      </p>
      <p className="text-sm text-muted">{tile.caption}</p>
    </article>
  );
}

export function KpiStrip({ tiles, noun }: { tiles: KpiTile[]; noun: string }) {
  return (
    <section className="col-span-12 min-w-0" aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" className="font-display text-2xl text-ink">
        Last {noun} in metro Atlanta
      </h2>
      <p className="mt-1 text-muted">
        Campaign totals follow this range. Dollars protected counts payments the family declined, so a new call does not move it.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} />
        ))}
      </div>
    </section>
  );
}
