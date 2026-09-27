"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatTile } from "@/components/ui/StatTile";
import { Toast } from "@/components/ui/Toast";

export default function StyleguidePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showToast, setShowToast] = useState(true);

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-5 py-8 pb-24">
      <SectionHeader
        title="Styleguide"
        subtitle="Warm Sentinel pieces used across scamshield.ai."
      />

      <section className="space-y-3">
        <h3 className="font-display text-xl">DemoDataTag</h3>
        <DemoDataTag />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Badge</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone="info" />
          <Badge tone="attention" />
          <Badge tone="critical" />
          <Badge tone="safe" />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Button</h3>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Card</h3>
        <Card>
          <p>A calm card on paper. Use this for most grouped content.</p>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">StatTile</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile
            label="Payments held"
            value="12"
            sparkline={[2, 3, 3, 5, 8, 7, 12]}
          />
          <StatTile label="Circles warned" value="38" />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Sparkline</h3>
        <Card>
          <Sparkline data={[4, 6, 5, 9, 8, 12, 10]} color="#009E73" />
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">SectionHeader</h3>
        <SectionHeader
          title="Example section"
          subtitle="Short supporting line."
          action={<DemoDataTag />}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">EmptyState</h3>
        <Card>
          <EmptyState
            icon={<Inbox aria-hidden="true" className="size-8" />}
            title="Nothing to review"
            body="When a check comes in for Nani, it will show up here."
            action={<Button variant="secondary">Refresh</Button>}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Skeleton</h3>
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Sheet</h3>
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open sheet
        </Button>
        <Sheet
          open={sheetOpen}
          title="Is this you?"
          onClose={() => setSheetOpen(false)}
        >
          <p className="text-muted">
            Someone claiming to be Aarav is on a call with Nani right now.
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={() => setSheetOpen(false)}>It’s me</Button>
            <Button variant="danger" onClick={() => setSheetOpen(false)}>
              Not me
            </Button>
          </div>
        </Sheet>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-xl">Toast</h3>
        <Button variant="ghost" onClick={() => setShowToast(true)}>
          Show toast
        </Button>
        {showToast ? (
          <Toast
            tone="safe"
            message="Good call checking — Nani was asked to hang up."
            onDismiss={() => setShowToast(false)}
          />
        ) : null}
      </section>
    </div>
  );
}
