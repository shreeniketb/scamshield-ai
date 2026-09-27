import { Fragment } from "react";
import { formatUsdCompact } from "@/lib/data/ic3ElderFraud2025";

export type StateTableRow = {
  postal: string;
  name: string;
  losses: number;
  complaints: number;
  rank: number;
  outsideTop?: boolean;
};

type StateTableProps = {
  rows: StateTableRow[];
  metric: "losses" | "complaints";
  pinned: string | null;
  hovered: string | null;
  onSelect: (postal: string) => void;
  onHover: (postal: string | null) => void;
};

export function StateTable({ rows, metric, pinned, hovered, onSelect, onHover }: StateTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-left">
        <caption className="sr-only">
          Top 10 states by {metric === "losses" ? "elder-fraud losses" : "elder-fraud complaints"}
        </caption>
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th className="py-2 pr-3 font-medium" scope="col">
              Rank
            </th>
            <th className="py-2 pr-3 font-medium" scope="col">
              State
            </th>
            <th
              className={`py-2 pr-3 text-right font-medium ${metric === "losses" ? "text-ink" : ""}`}
              scope="col"
            >
              Losses
            </th>
            <th className={`py-2 text-right font-medium ${metric === "complaints" ? "text-ink" : ""}`} scope="col">
              Complaints
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isPinned = pinned === row.postal;
            const isHovered = hovered === row.postal;
            const isGeorgia = row.postal === "GA";
            return (
              <Fragment key={row.postal}>
                {row.outsideTop ? (
                  <tr>
                    <td colSpan={4} className="pt-4 text-sm text-muted">
                      Pinned, outside the top 10
                    </td>
                  </tr>
                ) : null}
                <tr
                  tabIndex={0}
                  aria-pressed={isPinned}
                  onClick={() => onSelect(row.postal)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(row.postal);
                    }
                  }}
                  onMouseEnter={() => onHover(row.postal)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(row.postal)}
                  onBlur={() => onHover(null)}
                  className={`cursor-pointer border-b border-line outline-none last:border-0 focus-visible:bg-brand-soft ${
                    isPinned || isHovered ? "bg-brand-soft" : isGeorgia ? "bg-paper" : ""
                  }`}
                >
                  <td className="min-h-12 py-3 pr-3 tabular-nums text-muted">{row.rank}</td>
                  <td className="py-3 pr-3 font-medium text-ink">
                    {row.name}
                    {isGeorgia ? <span className="ml-2 text-sm font-normal text-brand">Nani&apos;s state</span> : null}
                    {isPinned ? <span className="ml-2 text-sm font-normal text-brand">Pinned</span> : null}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">{formatUsdCompact(row.losses)}</td>
                  <td className="py-3 text-right tabular-nums">{row.complaints.toLocaleString("en-US")}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
