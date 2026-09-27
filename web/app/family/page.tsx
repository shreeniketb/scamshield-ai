import Link from "next/link";
import { WarnCommunityButton } from "@/components/family/WarnCommunityButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DemoDataTag, DemoMark, isDemoCampaignId } from "@/components/ui/DemoDataTag";
import { StatTile } from "@/components/ui/StatTile";
import { getAlerts, getCampaigns, getCircle, getIncidents } from "@/lib/api";
import { formatEastern } from "@/lib/time";

export default async function FamilyHomePage() {
  const [circle, incidents, campaigns, alerts] = await Promise.all([
    getCircle(),
    getIncidents(),
    getCampaigns(),
    getAlerts().catch(() => []),
  ]);
  const live = incidents.filter((item) => !item.is_demo);
  const recent = live.slice(0, 3);
  const nearby = campaigns.slice(0, 2);
  const nearbyHasDemo = nearby.some((campaign) => isDemoCampaignId(campaign.id));
  const latestLive = live[0] ?? null;
  const attention =
    (latestLive && latestLive.risk_score >= 0.6 ? latestLive : null) ??
    alerts.find((alert) => !alert.seen && alert.severity === "critical") ??
    null;

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekLive = live.filter((item) => Date.parse(item.started_at) >= weekAgo);
  const typeCounts = new Map<string, number>();
  for (const item of weekLive) {
    const label = item.scam_type_label || "Unclassified";
    if (item.risk_score < 0.6) continue;
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
  }
  const scamTypesThisWeek = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Nani · Atlanta 30318</p>
        {nearbyHasDemo ? <DemoDataTag /> : null}
      </div>

      <section>
        <h2 className="sr-only">Status</h2>
        <Card className={attention ? "bg-attention-soft" : "bg-safe-soft"}>
          <Badge tone={attention ? "attention" : "safe"}>{attention ? "Needs attention" : "No issues currently"}</Badge>
          <p className="mt-3 text-ink">
            {attention
              ? "family_summary" in attention
                ? attention.family_summary
                : attention.title
              : "No issues currently"}
          </p>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Quick actions</h2>
        <div className="grid grid-cols-2 auto-rows-fr gap-2">
          <a className="inline-flex h-full min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="tel:+14045550100">
            Call Nani
          </a>
          <Link className="inline-flex h-full min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="/family/circle">
            Safe word
          </Link>
          <Link className="inline-flex h-full min-h-12 items-center justify-center rounded-card bg-brand-soft text-brand" href="/family/circle">
            Contacts
          </Link>
          <WarnCommunityButton callId={latestLive?.id ?? null} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">This week</h2>
        <div className="grid gap-3">
          <StatTile label="Threats stopped" value={String(circle.health.threats_caught_30d)} />
          <StatTile label="$ protected" value={circle.health.dollars_protected_30d ? `$${circle.health.dollars_protected_30d}` : "$0"} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Scam types this week</h2>
        <Card>
          {scamTypesThisWeek.length === 0 ? (
            <p className="text-muted">No live scam types yet. Grok fills this in when a call is classified.</p>
          ) : (
            <ul className="space-y-2">
              {scamTypesThisWeek.map(([type, count]) => (
                <li key={type} className="flex justify-between gap-3">
                  <span>{type}</span>
                  <span className="tabular-nums text-muted">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl">Recent activity</h2>
        {recent.length === 0 ? (
          <Card>
            <p className="text-muted">No live calls yet.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {recent.map((incident) => (
              <li key={incident.id}>
                <Link href={`/family/activity/${incident.id}`}>
                  <Card>
                    <p className="font-medium">{incident.title}</p>
                    <p className="text-sm text-muted">{formatEastern(incident.started_at)}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
                  <p className="font-medium">
                    {campaign.name}
                    {isDemoCampaignId(campaign.id) ? <DemoMark /> : null}
                  </p>
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
