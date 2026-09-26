"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Home, Radio, Users } from "lucide-react";

const tabs = [
  { href: "/family", label: "Home", icon: Home, match: (path: string) => path === "/family" },
  {
    href: "/family/activity",
    label: "Activity",
    icon: Activity,
    match: (path: string) => path.startsWith("/family/activity"),
  },
  {
    href: "/family/circle",
    label: "Circle",
    icon: Users,
    match: (path: string) => path.startsWith("/family/circle"),
  },
  {
    href: "/family/community",
    label: "Community",
    icon: Radio,
    match: (path: string) => path.startsWith("/family/community"),
  },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Family"
      className="sticky bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                  active ? "text-brand" : "text-muted"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="font-medium">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
