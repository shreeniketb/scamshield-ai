import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { StatTile } from "@/components/ui/StatTile";
import { getCampaigns, getCommunitySummary, getMap, getScamTypes, getStates } from "@/lib/api";

export default async function CommunityPage() {
  const [summary, campaigns, map, scamTypes, states] = await Promise.all([
    getCommunitySummary(),
    getCampaigns(),
    getMap(),
    getScamTypes(),
    getStates(),
  ]);

  return (
    <>
      <section className="col-span-12 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Community Watch · Atlanta</h1>
          <p className="text-muted">Live · Updated 1 min ago</p>
        </div>
        <DemoDataTag />
      </section>

      <section className="col-span-12">
        <h2 className="mb-3 font-display text-xl">Families warned before the scam reached them</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <StatTile
              label="Families warned first"
              value={String(summary.circles_warned_before_exposure)}
              sparkline={campaigns[0]?.trend.slice(-7)}
            />
          </div>
          <StatTile label="Active campaigns" value={String(summary.active_campaigns_24h)} />
          <StatTile label="$ protected" value={`$${(summary.dollars_protected / 1000).toFixed(1)}k`} />
        </div>
      </section>

      <section className="col-span-12 lg:col-span-7">
        <h2 className="mb-3 font-display text-xl">Live campaigns</h2>
        <ul className="space-y-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card>
                <p className="font-medium">{campaign.name}</p>
                <p className="text-sm text-muted">{campaign.how_to_spot}</p>
                <p className="mt-2 text-sm text-muted">
                  {campaign.reports_24h} reports · {campaign.areas.join(", ")}
                </p>
                <Link
                  href={`/community/campaign/${campaign.id}`}
                  className="mt-2 inline-flex min-h-12 items-center text-brand"
                >
                  Details →
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="col-span-12 lg:col-span-5">
        <h2 className="mb-3 font-display text-xl">Atlanta map</h2>
        <Card>
          <p className="text-muted">MapLibre map in a later phase. {map.length} ZIPs seeded.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {map.slice(0, 6).map((zip) => (
              <li key={zip.zip}>
                {zip.zip} {zip.neighborhood} · {zip.reports_24h} reports
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="col-span-12 lg:col-span-7">
        <h2 className="mb-3 font-display text-xl">How warnings travel</h2>
        <Card>
          <p>1 report protected 38 families within 2 hours. Network visual in a later phase.</p>
        </Card>
      </section>

      <section className="col-span-12 lg:col-span-5">
        <h2 className="mb-3 font-display text-xl">Scam types this week</h2>
        <Card>
          <ul className="space-y-2">
            {scamTypes.map((item) => (
              <li key={item.type} className="flex justify-between gap-3">
                <span>{item.type}</span>
                <span className="tabular-nums">{item.reports}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="col-span-12">
        <h2 className="mb-3 font-display text-xl">National context</h2>
        <Card>
          <p className="text-muted">
            FBI IC3 2025 Elder Fraud Report. Placeholder figures for {states.length} states until Raj
            provides the real numbers.
          </p>
        </Card>
      </section>

      <footer className="col-span-12 text-sm text-muted">
        Demo data. No names, numbers or links are ever shown. Areas appear only after 5+ reports.
      </footer>
    </>
  );
}
