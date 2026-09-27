import { clean } from "@/lib/db";
import { createAlert } from "@/lib/server/alerts";
import { collections } from "@/lib/server/collections";
import { badRequest, json, notFound, readBody } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody<{ member_id?: string; decision?: string }>(request);
  if (!body?.member_id || (body.decision !== "approved" && body.decision !== "declined")) {
    return badRequest('member_id and decision ("approved" | "declined") are required');
  }

  const db = await getSeededDb();
  const c = collections(db);
  // Only a held payment can be decided; the first family answer wins.
  const result = await c.payments.updateOne(
    { id, status: "held" },
    { $set: { status: body.decision, decided_by: body.member_id } },
  );
  const payment = await c.payments.findOne({ id }, clean);
  if (!payment) return notFound("Unknown payment");

  if (result.modifiedCount > 0) {
    const circle = await c.circles.findOne({ id: payment.circle_id });
    const who = circle?.members.find((member) => member.id === body.member_id)?.name ?? "Family";
    await createAlert(db, {
      circle_id: payment.circle_id,
      kind: "payment",
      severity: "info",
      title:
        body.decision === "declined"
          ? `Declined by ${who} · $${payment.amount} protected`
          : `Approved by ${who} · $${payment.amount} sent`,
      body: payment.merchant,
      ref_id: payment.id,
    });
  }
  return json(payment);
}
