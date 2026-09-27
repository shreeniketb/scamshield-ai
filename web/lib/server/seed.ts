import type { Db } from "mongodb";
import { getDb } from "../db";
import { circleHealthWeeks } from "../mock/community";
import { seedReports } from "../mock/reports";
import { seedCircle, seedPayments, seedSettings, seedVerifies } from "../mock/seed";
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

// The 8 demo incidents and their linked payment/verify stay as history, marked
// seeded so live statistics can tell them apart from real desktop-app events.
async function insertHistory(db: Db) {
  const { reports, payments, verifies } = collections(db);
  await reports.bulkWrite(
    seedReports.map((report) => ({
      replaceOne: {
        filter: { call_id: report.call_id },
        replacement: { ...report, seeded: true },
        upsert: true,
      },
    })),
  );
  await payments.bulkWrite(
    seedPayments.map((payment) => ({
      replaceOne: {
        filter: { id: payment.id },
        replacement: { ...payment, status: "declined" as const, decided_by: "u_priya", seeded: true },
        upsert: true,
      },
    })),
  );
  await verifies.bulkWrite(
    seedVerifies.map((verify) => ({
      replaceOne: { filter: { id: verify.id }, replacement: { ...verify, seeded: true }, upsert: true },
    })),
  );
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
  await insertHistory(db);
}

let seededThisProcess = false;

// Every API route calls this instead of getDb(), so the demo circle exists on
// the very first request against an empty database.
export async function getSeededDb(): Promise<Db> {
  const db = await getDb();
  if (seededThisProcess) return db;
  const existing = await collections(db).circles.findOne({ id: CIRCLE_ID });
  if (!existing) await resetDemo(db);
  seededThisProcess = true;
  return db;
}
