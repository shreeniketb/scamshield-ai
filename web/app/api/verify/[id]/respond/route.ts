import { clean } from "@/lib/db";
import { createAlert } from "@/lib/server/alerts";
import { collections } from "@/lib/server/collections";
import { badRequest, json, notFound, nowIso, readBody } from "@/lib/server/http";
import { expireVerifies } from "@/lib/server/rules";
import { getSeededDb } from "@/lib/server/seed";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody<{ response?: string }>(request);
  if (body?.response !== "me" && body?.response !== "not_me") {
    return badRequest('response must be "me" or "not_me"');
  }

  const db = await getSeededDb();
  const { verifies } = collections(db);
  await expireVerifies(db);

  // Only a pending request can be answered; late answers return it unchanged.
  const status = body.response === "me" ? "confirmed" : "denied";
  const result = await verifies.updateOne(
    { id, status: "pending" },
    { $set: { status, responded_at: nowIso() } },
  );
  const verify = await verifies.findOne({ id }, clean);
  if (!verify) return notFound("Unknown verify request");

  if (result.modifiedCount > 0 && status === "denied") {
    await createAlert(db, {
      circle_id: verify.circle_id,
      kind: "verify",
      severity: "critical",
      title: `${verify.claimed_member_name} said NOT me`,
      body: "Someone is pretending to be family. Nani has been told to hang up.",
      ref_id: verify.id,
    });
  }
  return json(verify);
}
