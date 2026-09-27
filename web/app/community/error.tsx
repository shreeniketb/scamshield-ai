"use client";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CommunityError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="col-span-12">
      <EmptyState
        title="Community Watch didn’t load"
        body="The dashboard couldn’t reach its data. Try again in a moment."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </section>
  );
}
