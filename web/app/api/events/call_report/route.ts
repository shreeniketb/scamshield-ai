import { severityForRisk, upsertEventAlert } from "@/lib/server/alerts";
import { collections } from "@/lib/server/collections";
import { badRequest, json, readBody } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";
import type { CallReport } from "@/lib/types";

// Sent by the desktop app when a call or message analysis is complete.
export async function POST(request: Request) {
  const report = await readBody<CallReport>(request);
  if (!report?.call_id || !report.circle_id || !report.overall) {
    return badRequest("call_id, circle_id and overall are required");
  }

  const db = await getSeededDb();
  await collections(db).reports.replaceOne({ call_id: report.call_id }, { ...report }, { upsert: true });

  const risk = report.overall.risk_score ?? 0;
  await upsertEventAlert(db, {
    circle_id: report.circle_id,
    kind: report.channel === "whatsapp_message" ? "message" : "call",
    severity: severityForRisk(risk),
    title: report.overall.outcome_label || "Call checked",
    body: report.family_summary || report.report_summary || "",
    ref_id: report.call_id,
  });

  return json({ ok: true, risk });
}
