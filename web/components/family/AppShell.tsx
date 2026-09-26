import type { ReactNode } from "react";
import { BottomTabBar } from "./BottomTabBar";
import { TopBar } from "./TopBar";
import { VerifyTakeover } from "./VerifyTakeover";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-surface shadow-card">
        <TopBar />
        <div className="flex-1 px-5 py-5 text-[18px]">{children}</div>
        <BottomTabBar />
      </div>
      <VerifyTakeover />
    </div>
  );
}
