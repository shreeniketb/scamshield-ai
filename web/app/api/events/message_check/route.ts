import type { MessageCheckEvent } from "@/lib/server/collections";
import { loadCircle } from "@/lib/server/circle";
import { badRequest, json, notFound, nowIso, readBody } from "@/lib/server/http";
import { processEvent, riskOf } from "@/lib/server/rules";
import { getSeededDb } from "@/lib/server/seed";

export async function POST(request: Request) {
  const body = await readBody<Partial<MessageCheckEvent>>(request);
  if (!body?.id || !body.circle_id) return badRequest("id and circle_id are required");

  const db = await getSeededDb();
  const circle = await loadCircle(db, body.circle_id);
  if (!circle) return notFound("Unknown circle");

  const event: MessageCheckEvent = {
    senior_id: circle.senior.id,
    channel: "whatsapp",
    sender: "",
    text: "",
    scam_probability: 0,
    ...body,
    id: body.id,
    circle_id: body.circle_id,
    type: "message_check",
    risk: riskOf(body),
    created_at: body.created_at ?? nowIso(),
    received_at: nowIso(),
  };
  const actions = await processEvent(db, circle, event);
  return json({ ok: true, risk: event.risk, actions });
}
