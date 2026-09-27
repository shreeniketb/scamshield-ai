"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isMockMode } from "@/lib/api";

// Re-fetches the page's server data every few seconds so figures, activity
// and Community Watch update live as the desktop app reports events.
export function LiveRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (isMockMode()) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => window.clearInterval(id);
  }, [router, everyMs]);

  return null;
}
