import type { Db } from "mongodb";
import type { Alert, AlertKind, AlertSeverity } from "../types";
import { collections } from "./collections";
import { newId, nowIso } from "./http";

const RANK: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };

export function severityForRisk(risk: number): AlertSeverity {
  if (risk < 0.4) return "info";
  if (risk < 0.7) return "warning";
  return "critical";
}

type NewAlert = {
  circle_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  ref_id: string;
};

export async function createAlert(db: Db, input: NewAlert): Promise<Alert> {
  const alert: Alert = { id: newId("al"), ...input, created_at: nowIso(), seen: false };
  await collections(db).alerts.insertOne({ ...alert });
  return alert;
}

// One alert per call/message: later chunks update it, and it only resurfaces
// (unseen, newest) when the severity goes up.
export async function upsertEventAlert(db: Db, input: NewAlert) {
  const { alerts } = collections(db);
  const existing = await alerts.findOne({ ref_id: input.ref_id, kind: input.kind });
  if (!existing) return createAlert(db, input);

  const escalated = RANK[input.severity] > RANK[existing.severity];
  await alerts.updateOne(
    { id: existing.id },
    {
      $set: {
        title: input.title,
        body: input.body,
        ...(escalated ? { severity: input.severity, created_at: nowIso(), seen: false } : {}),
      },
    },
  );
}
