import { ic3ElderFraud2025 } from "../data/ic3ElderFraud2025";
import type {
  Campaign,
  CircleHealthWeek,
  CommunitySummary,
  MapZip,
  MutationPoint,
  ScamTypeTotal,
  StateStat,
  WarningNetwork,
} from "../types";

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hourlyTrend(seed: number, hours: number, peak: number) {
  const rand = mulberry32(seed);
  return Array.from({ length: hours }, (_, i) => {
    const wave = Math.sin((i / hours) * Math.PI) * peak;
    return Math.max(0, Math.round(wave + rand() * 3));
  });
}

export const atlantaZips: MapZip[] = [
  { zip: "30318", lat: 33.79, lon: -84.44, reports_24h: 6, neighborhood: "West Midtown" },
  { zip: "30309", lat: 33.798, lon: -84.388, reports_24h: 5, neighborhood: "Midtown" },
  { zip: "30308", lat: 33.771, lon: -84.377, reports_24h: 4, neighborhood: "Old Fourth Ward" },
  { zip: "30306", lat: 33.786, lon: -84.351, reports_24h: 3, neighborhood: "Virginia-Highland" },
  { zip: "30307", lat: 33.768, lon: -84.337, reports_24h: 4, neighborhood: "Inman Park" },
  { zip: "30312", lat: 33.746, lon: -84.378, reports_24h: 3, neighborhood: "Grant Park" },
  { zip: "30316", lat: 33.73, lon: -84.34, reports_24h: 5, neighborhood: "East Atlanta" },
  { zip: "30317", lat: 33.75, lon: -84.32, reports_24h: 2, neighborhood: "Kirkwood" },
  { zip: "30319", lat: 33.87, lon: -84.34, reports_24h: 2, neighborhood: "Brookhaven" },
  { zip: "30324", lat: 33.82, lon: -84.36, reports_24h: 3, neighborhood: "Morningside" },
  { zip: "30305", lat: 33.83, lon: -84.39, reports_24h: 2, neighborhood: "Buckhead" },
  { zip: "30326", lat: 33.85, lon: -84.36, reports_24h: 1, neighborhood: "Lenox" },
  { zip: "30342", lat: 33.88, lon: -84.38, reports_24h: 1, neighborhood: "North Buckhead" },
  { zip: "30328", lat: 33.93, lon: -84.39, reports_24h: 2, neighborhood: "Sandy Springs" },
  { zip: "30327", lat: 33.86, lon: -84.42, reports_24h: 1, neighborhood: "Northwest Atlanta" },
  { zip: "30339", lat: 33.89, lon: -84.47, reports_24h: 3, neighborhood: "Vinings" },
  { zip: "30331", lat: 33.72, lon: -84.57, reports_24h: 4, neighborhood: "Southwest Atlanta" },
  { zip: "30311", lat: 33.73, lon: -84.47, reports_24h: 3, neighborhood: "West End" },
  { zip: "30310", lat: 33.73, lon: -84.42, reports_24h: 2, neighborhood: "Pittsburgh" },
  { zip: "30315", lat: 33.71, lon: -84.38, reports_24h: 3, neighborhood: "South Atlanta" },
  { zip: "30303", lat: 33.755, lon: -84.39, reports_24h: 2, neighborhood: "Downtown" },
  { zip: "30313", lat: 33.77, lon: -84.4, reports_24h: 2, neighborhood: "Georgia Tech" },
  { zip: "30332", lat: 33.776, lon: -84.4, reports_24h: 1, neighborhood: "Georgia Tech campus" },
  { zip: "30314", lat: 33.754, lon: -84.41, reports_24h: 2, neighborhood: "AUC" },
  { zip: "30344", lat: 33.68, lon: -84.44, reports_24h: 3, neighborhood: "East Point" },
];

export const campaigns: Campaign[] = [
  {
    id: "camp_grandparent_voice",
    name: "Grandparent voice-clone call",
    channels: ["call", "voice"],
    reports_24h: 11,
    trend: hourlyTrend(11, 72, 8),
    first_seen: "2026-09-25T09:10:00Z",
    areas: ["30318", "30309", "30316"],
    example_redacted: "Grandma it's me, I need bail money, please don't tell Mom…",
    how_to_spot: "A 'grandson' on a new number, rushed, asking you to keep it secret — then gift cards.",
    severity: "critical",
    variant_names: ["Bail money", "Accident + gift cards", "Hospital bill"],
  },
  {
    id: "camp_georgia_power",
    name: "Fake Georgia Power shutoff",
    channels: ["sms", "whatsapp"],
    reports_24h: 14,
    trend: hourlyTrend(22, 72, 10),
    first_seen: "2026-09-24T08:00:00Z",
    areas: ["30318", "30311", "30331"],
    example_redacted: "Your service will be disconnected TODAY. Pay at gpwr-bill[.]net…",
    how_to_spot: "Georgia Power does not collect over WhatsApp. Look at a paper bill.",
    severity: "warning",
    variant_names: ["Same-day shutoff", "Storm restoration fee"],
  },
  {
    id: "camp_medicare",
    name: "Fake Medicare card call",
    channels: ["call"],
    reports_24h: 9,
    trend: hourlyTrend(33, 72, 6),
    first_seen: "2026-09-20T12:00:00Z",
    areas: ["30305", "30319", "30328"],
    example_redacted: "Your Medicare card is cancelled unless you confirm your Social Security number…",
    how_to_spot: "Medicare will not cold-call for your SSN.",
    severity: "critical",
    variant_names: ["Card cancelled", "New card fee"],
  },
  {
    id: "camp_bank_fraud",
    name: "Fake bank freeze text",
    channels: ["sms"],
    reports_24h: 18,
    trend: hourlyTrend(44, 72, 12),
    first_seen: "2026-09-18T07:30:00Z",
    areas: ["30309", "30308", "30303", "30324"],
    example_redacted: "We froze a $1,940 charge. Confirm now: chase-secure[.]help/…",
    how_to_spot: "Open the bank app you already have. Never tap a texted link.",
    severity: "warning",
    variant_names: ["Frozen charge", "Unusual login"],
  },
  {
    id: "camp_peach_pass",
    name: "Fake Peach Pass toll",
    channels: ["sms"],
    reports_24h: 7,
    trend: hourlyTrend(55, 72, 5),
    first_seen: "2026-09-16T06:15:00Z",
    areas: ["30339", "30327", "30318"],
    example_redacted: "Unpaid toll $91.50. Avoid collections: peachpass-pay[.]co",
    how_to_spot: "Pay Peach Pass only on the account you already set up.",
    severity: "warning",
    variant_names: ["Unpaid toll", "Collections threat"],
  },
  {
    id: "camp_delivery",
    name: "Package notice noise",
    channels: ["sms"],
    reports_24h: 4,
    trend: hourlyTrend(66, 72, 3),
    first_seen: "2026-09-14T10:00:00Z",
    areas: ["30307", "30317"],
    example_redacted: "Your package is waiting. Pay a $2.95 redelivery fee at…",
    how_to_spot: "Carriers do not ask for a redelivery fee by text.",
    severity: "info",
    variant_names: ["Redelivery fee", "Customs hold"],
  },
  {
    id: "camp_irs_refund",
    name: "Fake IRS refund call",
    channels: ["call", "sms"],
    reports_24h: 6,
    trend: hourlyTrend(77, 72, 4),
    first_seen: "2026-09-13T14:20:00Z",
    areas: ["30315", "30310", "30344"],
    example_redacted: "You have a $2,400 IRS refund waiting. Confirm your routing number…",
    how_to_spot: "The IRS does not call about refunds on WhatsApp.",
    severity: "warning",
    variant_names: ["Refund waiting", "Audit threat"],
  },
];

const templates = [
  "Grandma it's me, I need {thing}, please don't tell Mom.",
  "It's your grandson — I'm on a friend's phone. Send {thing} now.",
  "There's been an accident. Buy {thing} and read me the codes.",
  "Don't call anyone yet. I need {thing} before 5pm.",
];

const things = ["bail money", "Apple gift cards", "a hospital deposit", "$500 in Target cards"];

export function mutationPointsFor(campaign: Campaign): MutationPoint[] {
  const rand = mulberry32(campaign.id.split("").reduce((a, c) => a + c.charCodeAt(0), 1));
  const count = 60 + Math.floor(rand() * 61);
  const variantCount = campaign.variant_names.length;
  const points: MutationPoint[] = [];
  const start = Date.parse(campaign.first_seen);

  for (let i = 0; i < count; i += 1) {
    const variant = i % variantCount;
    const angle = (variant / variantCount) * Math.PI * 2 + rand() * 0.6;
    const radius = 0.15 + rand() * 0.35;
    const zip = campaign.areas[Math.floor(rand() * campaign.areas.length)];
    const text = templates[variant % templates.length].replace(
      "{thing}",
      things[(variant + i) % things.length],
    );
    points.push({
      x: Math.cos(angle) * radius + variant * 0.15,
      y: Math.sin(angle) * radius,
      variant,
      text_redacted: text.replace(/\d/g, "#"),
      first_seen: new Date(start + i * 18 * 60 * 1000).toISOString(),
      zip,
    });
  }
  return points;
}

export function warningNetworkFor(campaign: Campaign): WarningNetwork {
  const nodes: WarningNetwork["nodes"] = [
    { id: "first", ring: 0, status: "first", label: `First report · ${campaign.areas[0]}` },
  ];
  const edges: WarningNetwork["edges"] = [];
  for (let i = 0; i < 12; i += 1) {
    const id = `w${i}`;
    nodes.push({ id, ring: 1, status: "warned", label: `Circle warned ${i + 1}` });
    edges.push({ from: "first", to: id });
  }
  for (let i = 0; i < 28; i += 1) {
    const id = `e${i}`;
    const status = i < 18 ? "before" : i < 24 ? "after" : "outside";
    nodes.push({ id, ring: 2, status, label: `Family ${i + 1}` });
    edges.push({ from: `w${i % 12}`, to: id });
  }
  return {
    campaign_id: campaign.id,
    insight: "1 report protected 38 families within 2 hours.",
    nodes,
    edges,
  };
}

export const stateStats: StateStat[] = ic3ElderFraud2025.map(({ state, losses_usd, complaints }) => ({
  state,
  losses_usd,
  complaints,
}));

export const communitySummary: CommunitySummary = {
  active_campaigns_24h: 7,
  circles_warned_before_exposure: 38,
  payments_held: 12,
  dollars_protected: 8400,
  voice_clones_caught: 5,
  data_label: "Demo data",
};

export const scamTypeTotals: ScamTypeTotal[] = [
  { type: "Grandparent / family emergency", reports: 22 },
  { type: "Bank impersonation", reports: 18 },
  { type: "Utility shutoff", reports: 14 },
  { type: "Medicare / health", reports: 9 },
  { type: "Toll / Peach Pass", reports: 7 },
  { type: "IRS refund", reports: 6 },
  { type: "Delivery fee", reports: 4 },
];

export const circleHealthWeeks: CircleHealthWeek[] = [
  { week_label: "W1", calls: 1 },
  { week_label: "W2", calls: 0 },
  { week_label: "W3", calls: 2 },
  { week_label: "W4", calls: 1 },
  { week_label: "W5", calls: 0 },
  { week_label: "W6", calls: 1 },
  { week_label: "W7", calls: 0 },
  { week_label: "W8", calls: 1 },
];
