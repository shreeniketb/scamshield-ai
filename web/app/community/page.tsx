import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { StatTile } from "@/components/ui/StatTile";
import { getCampaigns, getCommunitySummary, getMap, getScamTypes, getStates } from "@/lib/api";
import { formatUsdCompact, ic3StateName } from "@/lib/data/ic3ElderFraud2025";

export default async function CommunityPage() {
  const [summary, campaigns, map, scamTypes, states] = await Promise.all([
    getCommunitySummary(),
    getCampaigns(),
    getMap(),
    getScamTypes(),
    getStates(),
  ]);
  const ranked = [...states].sort((a, b) => b.losses_usd - a.losses_usd);
  const top10 = ranked.slice(0, 10);
  const georgia = ranked.find((row) => row.state === "GA");

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
        <h2 className="mb-3 font-display text-xl">
          Five states account for nearly half of reported elder-fraud losses
        </h2>
        <Card>
          <p className="text-muted">
            Georgia ranks 8th — {formatUsdCompact(georgia?.losses_usd ?? 0)} reported by people 60+.
          </p>
          {top10.length === 0 ? (
            <p className="mt-4 text-muted">National figures could not be loaded.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="sr-only">
                  Top 10 US states by FBI IC3 2025 elder-fraud losses among people age 60 and older
                </caption>
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="py-2 pr-3 font-medium" scope="col">
                      Rank
                    </th>
                    <th className="py-2 pr-3 font-medium" scope="col">
                      State
                    </th>
                    <th className="py-2 pr-3 text-right font-medium" scope="col">
                      Losses
                    </th>
                    <th className="py-2 text-right font-medium" scope="col">
                      Complaints
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((row, index) => {
                    const isGeorgia = row.state === "GA";
                    return (
                      <tr
                        key={row.state}
                        className={`border-b border-line last:border-0 ${isGeorgia ? "bg-brand-soft" : ""}`}
                      >
                        <td className="py-2 pr-3 tabular-nums text-muted">{index + 1}</td>
                        <td className="py-2 pr-3 font-medium">
                          {ic3StateName[row.state] ?? row.state}
                          {isGeorgia ? " · Nani's state" : ""}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatUsdCompact(row.losses_usd)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.complaints.toLocaleString("en-US")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-sm text-muted">
            Source: FBI IC3 2025 Elder Fraud Report (age 60+). {states.length} states loaded.
          </p>
        </Card>
      </section>

      <footer className="col-span-12 text-sm text-muted">
        Atlanta campaigns and the ZIP map are ScamShield demo data plus live reports. The national
        table is FBI IC3 2025 elder fraud. No names, numbers or links are ever shown. Areas appear
        only after 5+ reports.
      </footer>
    </>
  );
}
