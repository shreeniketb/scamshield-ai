import type { Db } from "mongodb";
import type { Payment, PaymentFactor } from "../types";
import { createAlert } from "./alerts";
import { collections, type CircleDoc } from "./collections";
import { newId, nowIso } from "./http";

const RISKY_METHODS = ["gift_card", "crypto", "wire"];
const METHOD_LABEL: Record<string, string> = {
  gift_card: "Gift-card payment",
  crypto: "Crypto payment",
  wire: "Wire transfer",
};

export type PaymentAttempt = {
  circle_id: string;
  senior_id: string;
  merchant: string;
  method: string;
  amount: number;
};

function minutesAgo(iso: string) {
  return Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
}

// Contract "Payments" scoring. Factors are listed so the family sees why.
export async function assessPayment(db: Db, circle: CircleDoc, attempt: PaymentAttempt): Promise<Payment> {
  const c = collections(db);
  const windowMin = circle.rules.hold_payments_after_flag_min || 30;
  const since = new Date(Date.now() - windowMin * 60000).toISOString();
  const factors: PaymentFactor[] = [];

  if (RISKY_METHODS.includes(attempt.method)) {
    factors.push({ label: METHOD_LABEL[attempt.method], weight: 0.35 });
  }

  const flagged = await c.events.findOne(
    { type: { $in: ["message_check", "call_analysis"] }, circle_id: circle.id, risk: { $gte: 0.6 }, received_at: { $gte: since } },
    { sort: { received_at: -1 } },
  );
  if (flagged && "risk" in flagged) {
    const noun = flagged.type === "call_analysis" ? "call" : "message";
    const minutes = minutesAgo(flagged.received_at);
    factors.push({
      label: `${minutes} minute${minutes === 1 ? "" : "s"} after a flagged ${noun}`,
      weight: 0.3,
    });
  }

  const badVerify = await c.verifies.findOne(
    {
      circle_id: circle.id,
      $or: [
        { status: "denied", responded_at: { $gte: since } },
        { status: "expired", expires_at: { $gte: since } },
      ],
    },
    { sort: { created_at: -1 } },
  );
  if (badVerify) {
    factors.push({
      label:
        badVerify.status === "denied"
          ? `${badVerify.claimed_member_name} said 'NOT me'`
          : `${badVerify.claimed_member_name} didn't answer in time`,
      weight: 0.25,
    });
  }

  if (attempt.amount > 200) factors.push({ label: `Large amount ($${attempt.amount})`, weight: 0.1 });

  const risk = Math.min(1, Math.round(factors.reduce((sum, f) => sum + f.weight, 0) * 100) / 100);
  const payment: Payment = {
    id: newId("pay"),
    circle_id: circle.id,
    senior_id: attempt.senior_id || circle.senior.id,
    merchant: attempt.merchant,
    method: attempt.method,
    amount: attempt.amount,
    situation_risk: risk,
    top_factors: factors.sort((a, b) => b.weight - a.weight),
    status: risk >= 0.6 ? "held" : "auto_ok",
    decided_by: null,
    created_at: nowIso(),
  };
  await c.payments.insertOne({ ...payment });

  if (payment.status === "held") {
    await createAlert(db, {
      circle_id: circle.id,
      kind: "payment",
      severity: "warning",
      title: `$${payment.amount} payment paused for family`,
      body: `${circle.senior.name} tried to pay ${payment.merchant}. It's on hold until someone in the circle decides.`,
      ref_id: payment.id,
    });
  }
  return payment;
}
