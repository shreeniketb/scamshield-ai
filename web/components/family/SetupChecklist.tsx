import { Card } from "@/components/ui/Card";

type Item = { label: string; done: boolean };

export function SetupChecklist({ items }: { items: Item[] }) {
  const done = items.filter((item) => item.done).length;
  const percent = Math.round((done / items.length) * 100);

  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-xl text-ink">Setup checklist</p>
          <p className="text-muted">
            {done} of {items.length} ready
          </p>
        </div>
        <p className="font-display text-3xl tabular-nums text-brand">{percent}%</p>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-pill bg-paper" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-pill bg-brand transition-all duration-200" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex min-h-12 items-center gap-3 rounded-card bg-paper px-4">
            <span
              aria-hidden="true"
              className={`flex size-6 items-center justify-center rounded-full text-sm font-medium ${
                item.done ? "bg-safe text-white" : "bg-line text-muted"
              }`}
            >
              {item.done ? "✓" : ""}
            </span>
            <span className={item.done ? "text-ink" : "text-muted"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
