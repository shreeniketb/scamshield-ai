import type { CallAnalysisEvent } from "@/lib/server/collections";
import { loadCircle } from "@/lib/server/circle";
import { badRequest, json, notFound, nowIso, readBody } from "@/lib/server/http";
import { processEvent, riskOf } from "@/lib/server/rules";
import { getSeededDb } from "@/lib/server/seed";

export async function POST(request: Request) {
  const body = await readBody<Partial<CallAnalysisEvent>>(request);
  if (!body?.id || !body.circle_id) return badRequest("id and circle_id are required");

  const db = await getSeededDb();
  const circle = await loadCircle(db, body.circle_id);
  if (!circle) return notFound("Unknown circle");

  const event: CallAnalysisEvent = {
    senior_id: circle.senior.id,
    channel: "whatsapp_call",
    caller: "",
    chunk_index: 0,
    ...body,
    id: body.id,
    circle_id: body.circle_id,
    type: "call_analysis",
    risk: riskOf(body),
    scam_type: blankToUndefined(body.scam_type),
    claimed_identity: blankToUndefined(body.claimed_identity) ?? null,
    claimed_organization: blankToUndefined(body.claimed_organization) ?? null,
    requested_amount: body.requested_amount ? body.requested_amount : null,
    payment_method: blankToUndefined(body.payment_method) ?? null,
    created_at: body.created_at ?? nowIso(),
    received_at: nowIso(),
    manual_stop: Boolean(body.manual_stop),
  };
  const actions = await processEvent(db, circle, event);
  return json({ ok: true, risk: event.risk, actions });
}

// Grok's strict schema can't return null, so it sends "" or "none" for "not given".
function blankToUndefined(value: string | null | undefined) {
  if (!value || value === "none") return undefined;
  return value;
}
