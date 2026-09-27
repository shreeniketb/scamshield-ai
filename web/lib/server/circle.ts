import type { Db } from "mongodb";
import { clean } from "../db";
import type { Circle, CircleHealth, CircleSettings } from "../types";
import { collections, type CircleDoc } from "./collections";
import { listReports } from "./reports";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadCircle(db: Db, id: string): Promise<CircleDoc | null> {
  return collections(db).circles.findOne({ id }, clean);
}

// Health figures are counted from real data in the database, so they move
// as soon as the desktop app reports something.
async function computeHealth(db: Db, circle: CircleDoc): Promise<CircleHealth> {
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [reports, payments] = await Promise.all([
    listReports(db, circle),
    collections(db).payments.find({ circle_id: circle.id, created_at: { $gte: since } }, clean).toArray(),
  ]);

  const threats = reports.filter(
    (report) => report.started_at >= since && report.overall.risk_score >= 0.6,
  ).length;
  const held = payments.filter((payment) => !("seeded" in payment && payment.seeded) && payment.status !== "auto_ok").length;
  const protectedDollars = reports
    .filter((report) => report.started_at >= since && (report.entities.requested_amount ?? 0) > 0)
    .reduce((sum, report) => sum + (report.entities.requested_amount ?? 0), 0);
  const lastWeek = circle.health_weeks[circle.health_weeks.length - 1];

  return {
    last_contact_days: Math.floor((Date.now() - Date.parse(circle.last_family_call_at)) / DAY_MS),
    calls_this_week: lastWeek?.calls ?? 0,
    threats_caught_30d: threats,
    payments_held_30d: held,
    dollars_protected_30d: protectedDollars,
  };
}

export async function publicCircle(db: Db, circle: CircleDoc): Promise<Circle> {
  return {
    id: circle.id,
    senior: circle.senior,
    members: circle.members,
    safe_word_set: Boolean(circle.safe_word),
    safe_word_last_used_at: circle.safe_word_last_used_at,
    safe_word_last_result: circle.safe_word_last_result,
    health: await computeHealth(db, circle),
  };
}

export function publicSettings(circle: CircleDoc): CircleSettings {
  return {
    circle_id: circle.id,
    members: circle.members,
    safe_word_set: Boolean(circle.safe_word),
    rules: circle.rules,
  };
}
