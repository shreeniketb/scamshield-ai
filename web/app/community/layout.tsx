import { DashboardShell } from "@/components/community/DashboardShell";

export default function CommunityLayout({ children }: LayoutProps<"/community">) {
  return <DashboardShell>{children}</DashboardShell>;
}
