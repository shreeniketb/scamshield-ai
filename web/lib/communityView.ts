import type { Campaign, CommunitySummary, MapZip, ScamTypeTotal } from "./types";

export type TimeRange = "24h" | "7d" | "30d";
export type CampaignSort = "growing" | "reports" | "newest";

export const RANGE_NOUN: Record<TimeRange, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

const RANGE_MS: Record<TimeRange, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

const SCAM_CAMPAIGN: Record<string, string> = {
  "Grandparent / family emergency": "camp_grandparent_voice",
  "Bank impersonation": "camp_bank_fraud",
  "Utility shutoff": "camp_georgia_power",
  "Medicare / health": "camp_medicare",
  "Toll / Peach Pass": "camp_peach_pass",
  "IRS refund": "camp_irs_refund",
  "Delivery fee": "camp_delivery",
};

export type KpiTile = {
  id: "families" | "campaigns" | "dollars" | "voices";
  label: string;
  value: string;
  spark: number[];
  sparkLabel: string;
  direction: "up" | "down" | "flat";
  delta: string;
  caption: string;
  spoken: string;
  hero?: boolean;
};

export type ZipView = {
  zip: string;
  lat: number;
  lon: number;
  neighborhood: string;
  reports: number;
  topCampaign: string;
};

export type ScamRow = { type: string; reports: number };

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function daysActive(firstSeen: string, now: number) {
  const days = (now - Date.parse(firstSeen)) / 86_400_000;
  if (!Number.isFinite(days)) return 1;
  return Math.max(1 / 24, days);
}

export function reportsInRange(campaign: Campaign, range: TimeRange, now: number) {
  if (range === "24h") return campaign.reports_24h;
  const span = range === "7d" ? 7 : 30;
  const days = Math.min(daysActive(campaign.first_seen, now), span);
  return Math.max(campaign.reports_24h, Math.round(campaign.reports_24h * days));
}

export function growthRate(trend: number[]) {
  if (trend.length < 2) return 0;
  const span = Math.max(1, Math.floor(trend.length / 6));
  const recent = trend.slice(-span);
  const prior = trend.slice(-span * 2, -span);
  if (prior.length === 0) return 0;
  const priorAvg = average(prior);
  if (priorAvg === 0) return average(recent) === 0 ? 0 : 1;
  return (average(recent) - priorAvg) / priorAvg;
}

export function sortCampaigns(
  campaigns: Campaign[],
  sort: CampaignSort,
  range: TimeRange,
  now: number,
) {
  const list = [...campaigns];
  if (sort === "reports") {
    list.sort(
      (a, b) => reportsInRange(b, range, now) - reportsInRange(a, range, now) || a.name.localeCompare(b.name),
    );
  } else if (sort === "newest") {
    list.sort((a, b) => Date.parse(b.first_seen) - Date.parse(a.first_seen));
  } else {
    list.sort((a, b) => growthRate(b.trend) - growthRate(a.trend) || a.name.localeCompare(b.name));
  }
  return list;
}

function stackedTrend(campaigns: Campaign[]) {
  const length = Math.max(0, ...campaigns.map((campaign) => campaign.trend.length));
  if (length === 0) return [];
  return Array.from({ length }, (_, index) =>
    campaigns.reduce((total, campaign) => {
      const start = length - campaign.trend.length;
      return total + (campaign.trend[index - start] ?? 0);
    }, 0),
  );
}

export function to24(series: number[], range: TimeRange) {
  if (series.length === 0) return Array.from({ length: 24 }, () => 0);
  if (range === "24h") {
    const slice = series.slice(-24);
    const pad = Array.from({ length: 24 - slice.length }, () => slice[0] ?? 0);
    return [...pad, ...slice];
  }
  return Array.from({ length: 24 }, (_, index) => {
    const start = Math.floor((index * series.length) / 24);
    const end = Math.max(start + 1, Math.floor(((index + 1) * series.length) / 24));
    const chunk = series.slice(start, end);
    return sum(chunk) / chunk.length;
  });
}

export function sparkEndingAt(series: number[], range: TimeRange, endValue: number) {
  return scaleTo(to24(series, range), endValue);
}

function scaleTo(series: number[], endValue: number) {
  const last = series[series.length - 1] ?? 0;
  if (last === 0) {
    return series.map((_, index) => (index === series.length - 1 ? endValue : 0));
  }
  const factor = endValue / last;
  return series.map((value, index) =>
    index === series.length - 1 ? endValue : Math.max(0, Math.round(value * factor)),
  );
}

export function paceDelta(series: number[], range: TimeRange) {
  if (series.length < 4) return 0;
  if (range === "7d") {
    const span = Math.max(1, Math.floor(series.length / 6));
    return percentChange(sum(series.slice(-span)), sum(series.slice(-span * 2, -span)));
  }
  if (range === "30d") {
    const span = Math.max(1, Math.floor(series.length / 3));
    return percentChange(sum(series.slice(-span)), sum(series.slice(0, span)));
  }
  const span = Math.max(1, Math.min(24, Math.floor(series.length / 3)));
  return percentChange(sum(series.slice(-span)), sum(series.slice(-span * 2, -span)));
}

export function paceCaption(range: TimeRange) {
  if (range === "24h") return "vs previous 24 hours";
  if (range === "7d") return "vs previous 12 hours";
  return "vs the start of this wave";
}

function paceSpoken(range: TimeRange) {
  if (range === "24h") return "versus the previous 24 hours";
  if (range === "7d") return "versus the previous 12 hours";
  return "versus the first day of this wave";
}

function directionOf(delta: number): KpiTile["direction"] {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function paceTile(
  id: KpiTile["id"],
  label: string,
  value: number,
  display: string,
  series: number[],
  range: TimeRange,
  noun: string,
  hero = false,
): KpiTile {
  const delta = paceDelta(series, range);
  const direction = directionOf(delta);
  const word = direction === "up" ? "Up" : direction === "down" ? "Down" : "No change";
  const caption = paceCaption(range);
  return {
    id,
    label,
    value: display,
    spark: scaleTo(to24(series, range), value),
    sparkLabel: display,
    direction,
    delta: direction === "flat" ? "No change" : `${Math.abs(delta)}%`,
    caption,
    spoken: `${display} ${label.toLowerCase()} in the last ${noun}. ${word} ${
      direction === "flat" ? "" : `${Math.abs(delta)} percent `
    }${paceSpoken(range)}.`.replace("  ", " "),
    hero,
  };
}

export function formatMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function totalReports(campaigns: Campaign[], range: TimeRange, now: number) {
  return campaigns.reduce((total, campaign) => total + reportsInRange(campaign, range, now), 0);
}

export function buildKpis(
  summary: CommunitySummary,
  campaigns: Campaign[],
  range: TimeRange,
  now: number,
): KpiTile[] {
  const noun = RANGE_NOUN[range];
  const week = totalReports(campaigns, "7d", now) || 1;
  const period = totalReports(campaigns, range, now);
  const ratio = period / week;
  const families = Math.max(1, Math.round(summary.circles_warned_before_exposure * ratio));
  const dollars = Math.max(0, Math.round(summary.dollars_protected * ratio));
  const voiceCampaigns = campaigns.filter((campaign) => campaign.channels.includes("voice"));
  const voiceWeek = totalReports(voiceCampaigns, "7d", now) || 1;
  const voicePeriod = totalReports(voiceCampaigns, range, now);
  const voices =
    voiceCampaigns.length === 0
      ? summary.voice_clones_caught
      : Math.max(0, Math.round(summary.voice_clones_caught * (voicePeriod / voiceWeek)));
  const active = campaigns.filter((campaign) => reportsInRange(campaign, range, now) > 0).length;
  const allTrend = stackedTrend(campaigns);
  const voiceTrend = stackedTrend(voiceCampaigns);

  const span = RANGE_MS[range];
  const start = now - span;
  const previousStart = start - span;
  let started = 0;
  let startedBefore = 0;
  for (const campaign of campaigns) {
    const seen = Date.parse(campaign.first_seen);
    if (seen >= start && seen <= now) started += 1;
    else if (seen >= previousStart && seen < start) startedBefore += 1;
  }
  const startDelta = startedBefore === 0 ? (started === 0 ? 0 : 100) : percentChange(started, startedBefore);
  const startDirection: KpiTile["direction"] =
    startedBefore === 0 && started > 0 ? "up" : directionOf(startDelta);
  const startDeltaText =
    startedBefore === 0 && started > 0
      ? `${started} new`
      : startDirection === "flat"
        ? "No change"
        : `${Math.abs(startDelta)}%`;
  const startCaption =
    startedBefore === 0 && started > 0
      ? "none in the previous period"
      : `${started} new this period, ${startedBefore} the period before`;
  const startWord =
    startDirection === "up" ? "Up" : startDirection === "down" ? "Down" : "No change in new campaigns";

  const activeSpark = scaleTo(
    Array.from({ length: 24 }, (_, index) => {
      const series = campaigns.map((campaign) => to24(campaign.trend, range));
      return series.filter((points) => (points[index] ?? 0) > 0).length;
    }),
    active,
  );

  return [
    paceTile(
      "families",
      "Families warned before the scam reached them",
      families,
      families.toLocaleString("en-US"),
      allTrend,
      range,
      noun,
      true,
    ),
    {
      id: "campaigns",
      label: "Active campaigns",
      value: String(active),
      spark: activeSpark,
      sparkLabel: String(active),
      direction: startDirection,
      delta: startDeltaText,
      caption: startCaption,
      spoken: `${active} active campaigns in the last ${noun}. New campaigns ${startWord.toLowerCase()} ${
        startDirection === "flat" ? "" : startDeltaText
      }. ${startCaption}.`,
    },
    paceTile("dollars", "Dollars protected", dollars, formatMoney(dollars), allTrend, range, noun),
    paceTile(
      "voices",
      "Voice clones caught",
      voices,
      voices.toLocaleString("en-US"),
      voiceTrend.length ? voiceTrend : allTrend,
      range,
      noun,
    ),
  ];
}

function zipRatio(zip: MapZip, campaigns: Campaign[], range: TimeRange, now: number) {
  if (range === "24h") return zip.reports_24h;
  const related = campaigns.filter((campaign) => campaign.areas.includes(zip.zip) && campaign.reports_24h > 0);
  if (related.length === 0) return zip.reports_24h;
  const ratio =
    related.reduce(
      (total, campaign) => total + reportsInRange(campaign, range, now) / campaign.reports_24h,
      0,
    ) / related.length;
  return Math.max(1, Math.round(zip.reports_24h * ratio));
}

function topCampaignName(zip: string, campaigns: Campaign[], range: TimeRange, now: number) {
  const related = campaigns.filter((campaign) => campaign.areas.includes(zip));
  if (related.length === 0) return "No single campaign leads";
  related.sort((a, b) => reportsInRange(b, range, now) - reportsInRange(a, range, now));
  return related[0]?.name ?? "No single campaign leads";
}

export function zipViews(map: MapZip[], campaigns: Campaign[], range: TimeRange, now: number): ZipView[] {
  return map
    .map((zip) => ({
      zip: zip.zip,
      lat: zip.lat,
      lon: zip.lon,
      neighborhood: zip.neighborhood,
      reports: zipRatio(zip, campaigns, range, now),
      topCampaign: topCampaignName(zip.zip, campaigns, range, now),
    }))
    .filter((zip) => zip.reports >= 5)
    .sort((a, b) => b.reports - a.reports || a.zip.localeCompare(b.zip));
}

export function scamRows(
  types: ScamTypeTotal[],
  campaigns: Campaign[],
  range: TimeRange,
  now: number,
): ScamRow[] {
  const week = totalReports(campaigns, "7d", now) || 1;
  const ratio = totalReports(campaigns, range, now) / week;
  return types
    .map((item) => {
      const campaign = campaigns.find((entry) => entry.id === SCAM_CAMPAIGN[item.type]);
      const reports = campaign
        ? reportsInRange(campaign, range, now)
        : Math.max(0, Math.round(item.reports * ratio));
      return { type: item.type, reports };
    })
    .filter((item) => item.reports > 0)
    .sort((a, b) => b.reports - a.reports || a.type.localeCompare(b.type));
}
