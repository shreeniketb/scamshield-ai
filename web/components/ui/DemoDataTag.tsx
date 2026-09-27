export function isDemoCampaignId(id: string) {
  return !id.includes("call_");
}

export function DemoDataTag({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
      {compact ? "Demo data" : "* Demo data — not from a real call"}
    </span>
  );
}

export function DemoMark() {
  return (
    <span className="ml-1 text-brand" title="Demo data">
      *
    </span>
  );
}
