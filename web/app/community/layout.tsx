import { DashboardShell } from "@/components/community/DashboardShell";
import { LiveRefresh } from "@/components/LiveRefresh";

// Always read fresh data (never baked in at build time).
export const dynamic = "force-dynamic";

export default function CommunityLayout({ children }: LayoutProps<"/community">) {
  return (
    <DashboardShell>
      <LiveRefresh />
      {children}
    </DashboardShell>
  );
}
