"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { CampaignCard } from "@/components/community/CampaignCard";
import { KpiStrip } from "@/components/community/KpiStrip";
import { NationalPanel } from "@/components/community/NationalPanel";
import { ScamTypeBars } from "@/components/community/ScamTypeBars";
import { WarningNetwork } from "@/components/community/WarningNetwork";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DemoDataTag } from "@/components/ui/DemoDataTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toast } from "@/components/ui/Toast";
import {
  buildKpis,
  RANGE_NOUN,
  reportsInRange,
  scamRows,
  sortCampaigns,
  zipViews,
  type CampaignSort,
  type TimeRange,
} from "@/lib/communityView";
import type { StateShape } from "@/lib/usMap";
import type { Campaign, CommunitySummary, MapZip, ScamTypeTotal, StateStat, WarningNetwork as WarningNetworkData } from "@/lib/types";

const AtlantaMap = dynamic(
  () => import("@/components/community/AtlantaMap").then((mod) => mod.AtlantaMap),
  {
    ssr: false,
    loading: () => <div className="h-[420px] animate-pulse rounded-[12px] bg-line lg:h-[480px]" aria-hidden="true" />,
  },
);

type CommunityDashboardProps = {
  now: number;
  summary: CommunitySummary;
  campaigns: Campaign[];
  map: MapZip[];
  scamTypes: ScamTypeTotal[];
  states: StateStat[];
  shapes: StateShape[];
  networks: WarningNetworkData[];
};

export function CommunityDashboard({
  now,
  summary,
  campaigns,
  map,
  scamTypes,
  states,
  shapes,
  networks,
}: CommunityDashboardProps) {
  const [range, setRange] = useState<TimeRange>("7d");
  const [sort, setSort] = useState<CampaignSort>("growing");
  const [hoverCampaign, setHoverCampaign] = useState<string | null>(null);
  const [hoverZip, setHoverZip] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState(
    networks.find((network) => network.campaign_id === "camp_grandparent_voice")?.campaign_id ??
      networks[0]?.campaign_id ??
      "",
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const noun = RANGE_NOUN[range];
  const tiles = useMemo(() => buildKpis(summary, campaigns, range, now), [summary, campaigns, range, now]);
  const zips = useMemo(() => zipViews(map, campaigns, range, now), [map, campaigns, range, now]);
  const visibleZips = useMemo(() => new Set(zips.map((zip) => zip.zip)), [zips]);
  const neighborhoods = useMemo(() => Object.fromEntries(map.map((zip) => [zip.zip, zip.neighborhood])), [map]);
  const ordered = useMemo(
    () => sortCampaigns(campaigns, sort, range, now).filter((campaign) => reportsInRange(campaign, range, now) > 0),
    [campaigns, sort, range, now],
  );
  const rows = useMemo(() => scamRows(scamTypes, campaigns, range, now), [scamTypes, campaigns, range, now]);
  const network = networks.find((item) => item.campaign_id === networkId) ?? null;
  const networkCampaign = campaigns.find((campaign) => campaign.id === networkId) ?? null;
  const lead = ordered[0];
  const listTitle = !lead
    ? "No campaigns in this range"
    : sort === "reports"
      ? `${lead.name} has the most reports in the last ${noun}`
      : sort === "newest"
        ? `${lead.name} is the newest campaign`
        : `${lead.name} is spreading fastest`;
  const topZip = zips[0];
  const mapTitle = topZip
    ? `${topZip.neighborhood} has the most reports in the last ${noun}`
    : "No neighbourhood has 5 reports in this range yet";

  const highlighted = hoverZip
    ? [hoverZip]
    : hoverCampaign
      ? (campaigns.find((campaign) => campaign.id === hoverCampaign)?.areas ?? []).filter((zip) =>
          visibleZips.has(zip),
        )
      : [];
  const litCampaigns = new Set(
    hoverCampaign
      ? [hoverCampaign]
      : hoverZip
        ? campaigns.filter((campaign) => campaign.areas.includes(hoverZip)).map((campaign) => campaign.id)
        : [],
  );

  function enterCampaign(id: string | null) {
    setHoverCampaign(id);
    if (id) setHoverZip(null);
  }

  function enterZip(zip: string | null) {
    setHoverZip((current) => (current === zip ? current : zip));
    if (zip) setHoverCampaign(null);
  }

  return (
    <>
      <section className="col-span-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">Community Watch · Atlanta</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
            <span className="live-dot inline-block size-2.5 rounded-full bg-safe" aria-hidden="true" />
            <span>Live</span>
            <span aria-hidden="true">·</span>
            <span>Updated 1 min ago</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: "24h", label: "24h", ariaLabel: "Last 24 hours" },
              { value: "7d", label: "7d", ariaLabel: "Last 7 days" },
              { value: "30d", label: "30d", ariaLabel: "Last 30 days" },
            ]}
          />
          <DemoDataTag compact />
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            <Download aria-hidden="true" className="size-4" />
            Download briefing
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          Showing the last {noun}.
        </p>
      </section>

      <KpiStrip tiles={tiles} noun={noun} />

      <div className="col-span-12 grid items-start gap-6 lg:grid-cols-12">
        <section className="min-w-0 lg:col-span-7" aria-labelledby="campaigns-heading">
          <div className="mb-4 flex flex-col gap-3">
            <div>
              <h2 id="campaigns-heading" className="font-display text-2xl text-ink">
                {listTitle}
              </h2>
              <p className="mt-1 text-muted">Hover a campaign to light up its ZIP codes on the map.</p>
            </div>
            <SegmentedControl
              label="Sort campaigns"
              value={sort}
              onChange={setSort}
              options={[
                { value: "growing", label: "Fastest growing" },
                { value: "reports", label: "Most reports" },
                { value: "newest", label: "Newest" },
              ]}
            />
          </div>
          {ordered.length === 0 ? (
            <Card>
              <EmptyState
                title="No campaigns in this range"
                body="When a scam is reported around Atlanta, it will show up here."
              />
            </Card>
          ) : (
            <ul className="space-y-4">
              {ordered.map((campaign) => (
                <li key={campaign.id}>
                  <CampaignCard
                    campaign={campaign}
                    reports={reportsInRange(campaign, range, now)}
                    now={now}
                    range={range}
                    neighborhoods={neighborhoods}
                    active={litCampaigns.has(campaign.id)}
                    activeZip={hoverZip}
                    onHover={enterCampaign}
                    onWarn={() =>
                      setToast(`Your circle will see a warning about ${campaign.name}. No personal details are included.`)
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 lg:sticky lg:top-6 lg:col-span-5 lg:self-start" aria-labelledby="map-heading">
          <Card>
            <h2 id="map-heading" className="font-display text-2xl text-ink">
              {mapTitle}
            </h2>
            <div className="mt-4">
              {zips.length === 0 ? (
                <EmptyState
                  title="No area is on the map yet"
                  body="We wait until a ZIP code has 5 reports, so one call never puts a neighbourhood on the map."
                />
              ) : (
                <>
                  <AtlantaMap zips={zips} highlighted={highlighted} activeZip={hoverZip} onHoverZip={enterZip} />
                  <ul className="mt-3 hidden list-disc space-y-1 pl-5 print:block">
                    {zips.map((zip) => (
                      <li key={zip.zip}>
                        {zip.neighborhood}, ZIP {zip.zip}: {zip.reports} reports. {zip.topCampaign}.
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </section>
      </div>

      <section className="col-span-12 min-w-0 lg:col-span-7" aria-labelledby="network-heading">
        <h2 id="network-heading" className="font-display text-2xl text-ink">
          {network?.insight ?? "How warnings travel"}
        </h2>
        <p className="mt-1 text-muted">
          {networkCampaign ? `Paths for ${networkCampaign.name}.` : "Pick a campaign to see how a warning moved."}
        </p>
        <Card className="mt-4">
          {networks.length === 0 ? (
            <EmptyState
              title="No warning paths yet"
              body="When a campaign has a first report, the circles it reached will show up here."
            />
          ) : (
            <>
              <label className="block text-sm text-muted" htmlFor="warning-campaign">
                Campaign
              </label>
              <select
                id="warning-campaign"
                value={networkId}
                onChange={(event) => setNetworkId(event.target.value)}
                className="mt-1 min-h-12 w-full rounded-card border border-line bg-surface px-3 text-ink"
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              {network ? (
                <div className="mt-4">
                  <WarningNetwork key={network.campaign_id} network={network} />
                </div>
              ) : (
                <p className="mt-4 text-muted">That campaign doesn’t have a warning map yet.</p>
              )}
            </>
          )}
        </Card>
      </section>

      <div className="col-span-12 min-w-0 lg:col-span-5">
        <ScamTypeBars rows={rows} noun={noun} />
      </div>

      <NationalPanel shapes={shapes} states={states} />

      <footer className="col-span-12 space-y-2 border-t border-line pt-6 text-sm text-muted">
        <p>
          Sources: Atlanta campaigns, the ZIP map, and warning paths are ScamShield demo data. The national map is the
          FBI IC3 2025 Elder Fraud Report.
        </p>
        <p>Simulated Atlanta reports are marked Demo data. They are not a live city feed.</p>
        <p>No names, numbers or links are ever shown. Areas appear only after 5+ reports.</p>
      </footer>

      {toast ? (
        <div className="no-print fixed bottom-6 left-1/2 z-50 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2">
          <Toast tone="safe" message={toast} onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </>
  );
}
