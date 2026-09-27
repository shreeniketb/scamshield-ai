import type { Db } from "mongodb";
import { getDb } from "../db";
import { circleHealthWeeks } from "../mock/community";
import { seedCircle, seedSettings } from "../mock/seed";
import { collections, type CircleDoc } from "./collections";

export const CIRCLE_ID = "circle_nani";

const DAY_MS = 24 * 60 * 60 * 1000;

// Contract: default members and rules, no safe word.
function defaultCircle(): CircleDoc {
  return {
    id: CIRCLE_ID,
    senior: seedCircle.senior,
    zip: "30318",
    members: seedCircle.members,
    rules: seedSettings.rules,
    safe_word: null,
    safe_word_last_used_at: null,
    safe_word_last_result: null,
    last_family_call_at: new Date(Date.now() - 6 * DAY_MS).toISOString(),
    health_weeks: circleHealthWeeks,
  };
}

const DUMMY_IDS = [
  "call_20260925_001",
  "msg_georgia_power_001",
  "call_priya_normal_001",
  "call_medicare_001",
  "msg_bank_fraud_001",
  "msg_peach_pass_001",
  "msg_delivery_001",
  "call_cousin_safe_word_001",
  "pay_001",
  "ver_001",
];

async function clearSeededHistory(db: Db) {
  const { reports, payments, verifies, events, alerts } = collections(db);
  await Promise.all([
    reports.deleteMany({ $or: [{ seeded: true }, { call_id: { $in: DUMMY_IDS } }] }),
    payments.deleteMany({ $or: [{ seeded: true }, { id: { $in: DUMMY_IDS } }] }),
    verifies.deleteMany({ $or: [{ seeded: true }, { id: { $in: DUMMY_IDS } }] }),
    events.deleteMany({ $or: [{ id: { $in: DUMMY_IDS } }, { id: { $regex: "^call_(demo|live_test)_" } }] }),
    alerts.deleteMany({ ref_id: { $in: DUMMY_IDS } }),
  ]);

  const live = await events.find({ type: "call_analysis" }).sort({ received_at: -1 }).toArray();
  const keep = new Set<string>();
  for (const event of live) {
    if ("id" in event && keep.size < 12) keep.add(event.id);
  }
  if (keep.size > 0) {
    await events.deleteMany({ type: "call_analysis", id: { $nin: [...keep] } });
  }
}

async function syncMemberNames(db: Db) {
  const circle = await collections(db).circles.findOne({ id: CIRCLE_ID });
  if (!circle) return;
  const renamed = circle.members.map((member) => {
    if (member.id === "u_aarav") return { ...member, name: "Kale", relation: "grandson" };
    if (member.id === "u_priya") return { ...member, name: "Vanessa", relation: "daughter" };
    if (member.id === "u_raj") return { ...member, name: "Shreeniket", relation: "close friend" };
    return member;
  });
  const rules = { ...circle.rules, protection_method: circle.rules.protection_method ?? "verify_member" };
  await collections(db).circles.updateOne({ id: CIRCLE_ID }, { $set: { members: renamed, rules } });
}

export async function resetDemo(db: Db) {
  const c = collections(db);
  await Promise.all([
    c.events.deleteMany({}),
    c.alerts.deleteMany({}),
    c.verifies.deleteMany({}),
    c.payments.deleteMany({}),
    c.reports.deleteMany({}),
  ]);
  await c.circles.replaceOne({ id: CIRCLE_ID }, defaultCircle(), { upsert: true });
}

let seededThisProcess = false;

// Every API route calls this instead of getDb(), so the demo circle exists on
// the very first request against an empty database.
export async function getSeededDb(): Promise<Db> {
  const db = await getDb();
  if (seededThisProcess) return db;
  const existing = await collections(db).circles.findOne({ id: CIRCLE_ID });
  if (!existing) await resetDemo(db);
  else {
    await syncMemberNames(db);
    await clearSeededHistory(db);
  }
  seededThisProcess = true;
  return db;
}
