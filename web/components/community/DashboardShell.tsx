import type { ReactNode } from "react";
import Link from "next/link";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3">
          <div>
            <p className="font-display text-xl text-brand">ScamShield</p>
            <p className="text-sm text-muted">Community Watch</p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Dashboard">
            <Link
              href="/family"
              className="inline-flex min-h-12 items-center rounded-pill px-4 text-sm text-ink hover:bg-brand-soft"
            >
              Family app
            </Link>
            <Link
              href="/demo"
              className="inline-flex min-h-12 items-center rounded-pill px-4 text-sm text-ink hover:bg-brand-soft"
            >
              Demo
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-6 px-6 py-6">{children}</div>
    </div>
  );
}
