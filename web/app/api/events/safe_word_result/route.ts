import { createAlert } from "@/lib/server/alerts";
import { collections, type SafeWordEvent } from "@/lib/server/collections";
import { badRequest, json, newId, nowIso, readBody } from "@/lib/server/http";
import { CIRCLE_ID, getSeededDb } from "@/lib/server/seed";

const RESULTS = ["passed", "failed", "not_asked"];

export async function POST(request: Request) {
  const body = await readBody<{ call_id?: string; result?: string }>(request);
  if (!body?.call_id || !RESULTS.includes(body.result ?? "")) {
    return badRequest('call_id and result ("passed" | "failed" | "not_asked") are required');
  }

  const db = await getSeededDb();
  const c = collections(db);
  const event: SafeWordEvent = {
    type: "safe_word_result",
    id: newId("sw"),
    call_id: body.call_id,
    result: body.result as SafeWordEvent["result"],
    received_at: nowIso(),
  };
  await c.events.insertOne({ ...event });

  const source = await c.events.findOne({ id: body.call_id, type: { $ne: "safe_word_result" } });
  const circleId = source && "circle_id" in source ? source.circle_id : CIRCLE_ID;

  if (event.result !== "not_asked") {
    await c.circles.updateOne(
      { id: circleId },
      { $set: { safe_word_last_used_at: event.received_at, safe_word_last_result: event.result } },
    );
  }
  if (event.result === "failed") {
    await createAlert(db, {
      circle_id: circleId,
      kind: "call",
      severity: "critical",
      title: "Identity theft / scam — wrong safe word",
      body: "The caller did not know the family safe word. Nani was told to hang up immediately.",
      ref_id: body.call_id,
    });
  }

  return json({ ok: true });
}
