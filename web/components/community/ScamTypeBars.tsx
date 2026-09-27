import { EmptyState } from "@/components/ui/EmptyState";
import type { ScamRow } from "@/lib/communityView";

export function ScamTypeBars({ rows, noun }: { rows: ScamRow[]; noun: string }) {
  const top = rows[0];
  const total = rows.reduce((sum, row) => sum + row.reports, 0);
  const share = top && total > 0 ? Math.round((top.reports / total) * 100) : 0;
  const title = top
    ? `${top.type} accounts for ${share}% of reports in the last ${noun}`
    : `No scam reports in the last ${noun}`;
  const max = top?.reports ?? 1;

  return (
    <section className="min-w-0" aria-labelledby="scam-types-heading">
      <h2 id="scam-types-heading" className="font-display text-2xl text-ink">
        {title}
      </h2>
      <p className="mt-1 text-muted">Reports by scam type, largest first.</p>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-card bg-surface shadow-card">
          <EmptyState
            title="Nothing reported in this range"
            body="When families report a scam, it will show up here by type."
          />
        </div>
      ) : (
        <div className="mt-4 rounded-card bg-surface p-5 shadow-card md:p-6">
          <ul
            className="space-y-4"
            aria-label={`${title}. ${rows.map((row) => `${row.type} ${row.reports}`).join(". ")}.`}
          >
            {rows.map((row) => {
              const width = Math.max(4, Math.round((row.reports / max) * 100));
              return (
                <li key={row.type}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink">{row.type}</span>
                    <span className="tabular-nums font-medium text-ink">{row.reports.toLocaleString("en-US")}</span>
                  </div>
                  <div className="mt-1.5 h-3 rounded-pill bg-line" aria-hidden="true">
                    <div className="h-3 rounded-pill bg-chart-1" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted">ScamShield reports in the selected range. Demo data.</p>
        </div>
      )}
    </section>
  );
}
