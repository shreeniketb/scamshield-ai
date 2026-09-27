import type { Db } from "mongodb";
import {
  atlantaZips,
  campaigns as baseCampaigns,
  communitySummary as baseSummary,
  scamTypeTotals as baseScamTypes,
} from "../mock/community";
import type { CallReport, Campaign, CommunitySummary, MapZip, ScamTypeTotal, StateStat } from "../types";
import { collections, type CircleDoc } from "./collections";
import { listReports } from "./reports";
import { CIRCLE_ID, seedIc3States } from "./seed";
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

export async function createCampaignFromCall(db: Db, callId: string): Promise<Campaign | null> {
  const circle = await collections(db).circles.findOne({ id: CIRCLE_ID });
  if (!circle) return null;
  const report = (await listReports(db, circle as CircleDoc)).find((item) => item.call_id === callId);
  if (!report) return null;
  if (report.overall.risk_score < 0.6) return null;

  const existing = await collections(db).campaigns.findOne({ from_call_id: callId });
  if (existing) {
    const { _id: _drop, seeded: _s, from_call_id: _f, ...rest } = existing as Campaign & {
      _id?: unknown;
      seeded?: boolean;
      from_call_id?: string;
    };
    return rest;
  }

  const label = scamTypeInfo(report.overall.scam_type).label;
  const campaign: Campaign & { from_call_id: string } = {
    id: `camp_${callId}`,
    name: `${label} reported from Nani's circle`,
    channels: [report.channel === "whatsapp_message" ? "sms" : "call"],
    reports_24h: 1,
    trend: [0, 0, 0, 0, 0, 0, 1],
    first_seen: report.started_at,
    areas: [circle.zip],
    example_redacted: report.family_summary || report.report_summary,
    how_to_spot: report.recommended_action.message || report.report_summary,
    severity: report.overall.risk_score >= 0.7 ? "critical" : "warning",
    variant_names: [label],
    from_call_id: callId,
  };
  await collections(db).campaigns.replaceOne({ id: campaign.id }, campaign, { upsert: true });
  return campaign;
}

export async function getCampaigns(db: Db): Promise<Campaign[]> {
  const live = await collections(db).campaigns.find({}).toArray();
  const liveMapped = live.map(({ _id, seeded, from_call_id, ...campaign }) => campaign as Campaign);
  const recent = (await liveReports(db)).filter(inLast24h);
  const baseline = baseCampaigns.map((campaign) => {
    const extra = recent.filter((report) => campaignIdOf(report) === campaign.id).length;
    if (!extra) return campaign;
    const trend = [...campaign.trend];
    trend[trend.length - 1] += extra;
    return { ...campaign, reports_24h: campaign.reports_24h + extra, trend };
  });
  return [...liveMapped, ...baseline];
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

export async function getStates(db: Db): Promise<StateStat[]> {
  await seedIc3States(db);
  const rows = await collections(db)
    .community_states.find({}, { projection: { _id: 0, source: 0, year: 0 } })
    .sort({ losses_usd: -1 })
    .toArray();
  return rows.map(({ state, losses_usd, complaints }) => ({ state, losses_usd, complaints }));
}
