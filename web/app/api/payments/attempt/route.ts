import { loadCircle } from "@/lib/server/circle";
import { badRequest, json, notFound, readBody } from "@/lib/server/http";
import { assessPayment, type PaymentAttempt } from "@/lib/server/payments";
import { getSeededDb } from "@/lib/server/seed";

export async function POST(request: Request) {
  const body = await readBody<Partial<PaymentAttempt>>(request);
  const amount = Number(body?.amount);
  if (!body?.circle_id || !body.method || !Number.isFinite(amount) || amount <= 0) {
    return badRequest("circle_id, method and a positive amount are required");
  }

  const db = await getSeededDb();
  const circle = await loadCircle(db, body.circle_id);
  if (!circle) return notFound("Unknown circle");

  const payment = await assessPayment(db, circle, {
    circle_id: circle.id,
    senior_id: body.senior_id ?? circle.senior.id,
    merchant: body.merchant ?? "Unknown merchant",
    method: body.method,
    amount,
  });
  return json(payment);
}
