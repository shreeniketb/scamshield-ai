"use client";

import { usePathname } from "next/navigation";

const titles: Array<{ test: (path: string) => boolean; title: string; subtitle?: string }> = [
  {
    test: (path) => path.startsWith("/family/activity/") && path !== "/family/activity",
    title: "Incident",
    subtitle: "The story of this call or message",
  },
  { test: (path) => path.startsWith("/family/activity"), title: "Activity" },
  { test: (path) => path.startsWith("/family/circle"), title: "Circle" },
  { test: (path) => path.startsWith("/family/community"), title: "Near Nani" },
  { test: () => true, title: "Nani's protection", subtitle: "Desktop app connected · 2 min ago" },
];

export function TopBar() {
  const pathname = usePathname();
  const match = titles.find((item) => item.test(pathname)) ?? titles[titles.length - 1];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="px-5 py-3">
        <p className="text-xs font-medium tracking-wide text-brand">ScamShield</p>
        <h1 className="font-display text-[28px] leading-tight text-ink">{match.title}</h1>
        {match.subtitle ? <p className="text-sm text-muted">{match.subtitle}</p> : null}
      </div>
    </header>
  );
}
