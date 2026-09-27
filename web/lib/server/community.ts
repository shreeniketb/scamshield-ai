import type { Db } from "mongodb";
import {
  atlantaZips,
  campaigns as baseCampaigns,
  communitySummary as baseSummary,
  scamTypeTotals as baseScamTypes,
} from "../mock/community";
import type { CallReport, Campaign, CommunitySummary, MapZip, ScamTypeTotal } from "../types";
import { collections, type CircleDoc } from "./collections";
import { listReports } from "./reports";
import { CIRCLE_ID } from "./seed";
import { scamTypeInfo } from "./scamTypes";

// Community Watch = the demo baseline (labelled "Demo data") plus every real
// report that came from the desktop app, added on top live.

const DAY_MS = 24 * 60 * 60 * 1000;

async function liveReports(db: Db): Promise<CallReport[]> {
  const c = collections(db);
  const circle = await c.circles.findOne({ id: CIRCLE_ID });
  if (!circle) return [];
  const [all, seeded] = await Promise.all([
    listReports(db, circle as CircleDoc),
    c.reports.find({ seeded: true }, { projection: { call_id: 1 } }).toArray(),
  ]);
  const seededIds = new Set(seeded.map((report) => report.call_id));
  return all.filter((report) => !seededIds.has(report.call_id) && report.community.reported);
}

function inLast24h(report: CallReport) {
  return Date.parse(report.started_at) >= Date.now() - DAY_MS;
}

function campaignIdOf(report: CallReport) {
  return report.community.campaign_id ?? scamTypeInfo(report.overall.scam_type).campaign_id;
}

export async function getSummary(db: Db): Promise<CommunitySummary> {
  const [reports, payments] = await Promise.all([
    liveReports(db),
    collections(db).payments.find({ seeded: { $ne: true } }).toArray(),
  ]);
  const voiceClones = reports.filter(
    (report) => (report.audio_forensics?.synthetic_probability ?? 0) > 0.7,
  ).length;
  const held = payments.filter((payment) => payment.status !== "auto_ok").length;
  const saved = payments
    .filter((payment) => payment.status === "declined")
    .reduce((sum, payment) => sum + payment.amount, 0);

  return {
    ...baseSummary,
    voice_clones_caught: baseSummary.voice_clones_caught + voiceClones,
    payments_held: baseSummary.payments_held + held,
    dollars_protected: baseSummary.dollars_protected + saved,
  };
}

export async function getCampaigns(db: Db): Promise<Campaign[]> {
  const recent = (await liveReports(db)).filter(inLast24h);
  return baseCampaigns.map((campaign) => {
    const extra = recent.filter((report) => campaignIdOf(report) === campaign.id).length;
    if (!extra) return campaign;
    const trend = [...campaign.trend];
    trend[trend.length - 1] += extra;
    return { ...campaign, reports_24h: campaign.reports_24h + extra, trend };
  });
}

export async function getMap(db: Db): Promise<MapZip[]> {
  const c = collections(db);
  const [recent, circle] = await Promise.all([
    liveReports(db).then((reports) => reports.filter(inLast24h)),
    c.circles.findOne({ id: CIRCLE_ID }),
  ]);
  if (!recent.length || !circle) return atlantaZips;
  return atlantaZips.map((zip) =>
    zip.zip === circle.zip ? { ...zip, reports_24h: zip.reports_24h + recent.length } : zip,
  );
}

export async function getScamTypes(db: Db): Promise<ScamTypeTotal[]> {
  const totals = new Map(baseScamTypes.map((item) => [item.type, item.reports]));
  for (const report of await liveReports(db)) {
    const label = scamTypeInfo(report.overall.scam_type).label;
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([type, reports]) => ({ type, reports }))
    .sort((a, b) => b.reports - a.reports);
}
