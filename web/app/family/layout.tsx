import { AppShell } from "@/components/family/AppShell";

export default function FamilyLayout({ children }: LayoutProps<"/family">) {
  return <AppShell>{children}</AppShell>;
}
