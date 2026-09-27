import { AppShell } from "@/components/family/AppShell";
import { LiveRefresh } from "@/components/LiveRefresh";

// Always read fresh data (never baked in at build time).
export const dynamic = "force-dynamic";

export default function FamilyLayout({ children }: LayoutProps<"/family">) {
  return (
    <AppShell>
      <LiveRefresh />
      {children}
    </AppShell>
  );
}
