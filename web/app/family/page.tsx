import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { StatTile } from "@/components/ui/StatTile";
import { getCampaigns, getCircle, getIncidents, getPayments } from "@/lib/api";

export default async function FamilyHomePage() {
  const [circle, incidents, payments, campaigns] = await Promise.all([
    getCircle(),
    getIncidents(),
    getPayments(),
    getCampaigns(),
  ]);
  const held = payments.find((item) => item.status === "held");
  const recent = incidents.slice(0, 3);
  const nearby = campaigns.slice(0, 2);
  const heroTone = held ? "attention" : "safe";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Nani · Atlanta 30318</p>
        <DemoDataTag />
      </div>

      <section>
        <h2 className="sr-only">Status</h2>
        <Card className={heroTone === "attention" ? "bg-attention-soft" : "bg-safe-soft"}>
          <Badge tone={heroTone === "attention" ? "attention" : "safe"}>
            {heroTone === "attention" ? "Needs attention" : "All clear — Nani is protected"}
          </Badge>
          <p className="mt-3 text-ink">
            {held
              ? `A $${held.amount} gift-card payment is paused until family decides.`
              : `${circle.health.threats_caught_30d} threats caught in the last 30 days.`}
          </p>
        </Card>
      </section>

      {held ? (
        <section>
          <h2 className="mb-2 font-display text-xl">Action queue</h2>
          <Card>
            <p className="font-medium">Payment paused</p>
            <p className="text-muted">
              ${held.amount} · {held.merchant}
            </p>
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 font-display text-xl">Quick actions</h2>
        <div className="grid grid-cols-2 gap-2">
          <a className="inline-flex min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="tel:+14045550100">
            Call Nani
          </a>
          <Link className="inline-flex min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="/family/circle">
            Safe word
          </Link>
          <Link className="inline-flex min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="/family/circle">
            Contacts
          </Link>
          <Link className="inline-flex min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="/family/community">
            Warn circle
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">This week</h2>
        <div className="grid gap-3">
          <StatTile label="Threats stopped" value={String(circle.health.threats_caught_30d)} sparkline={[1, 2, 1, 3, 2, 4, 4]} />
          <StatTile label="$ protected" value={`$${circle.health.dollars_protected_30d}`} />
          <StatTile label="Family calls with Nani" value={String(circle.health.calls_this_week)} sparkline={[1, 0, 2, 1, 0, 1, 1]} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Recent activity</h2>
        <ul className="space-y-2">
          {recent.map((incident) => (
            <li key={incident.id}>
              <Link href={`/family/activity/${incident.id}`}>
                <Card>
                  <p className="font-medium">{incident.title}</p>
                  <p className="text-sm text-muted">{new Date(incident.started_at).toLocaleString()}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/family/activity" className="mt-2 inline-flex min-h-12 items-center text-brand">
          See all
        </Link>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Scams near Nani</h2>
        <ul className="space-y-2">
          {nearby.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`/community/campaign/${campaign.id}`}>
                <Card>
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-sm text-muted">{campaign.reports_24h} reports in 24h</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
