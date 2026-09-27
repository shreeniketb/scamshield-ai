import type { Db } from "mongodb";
import type { CircleMember, VerifyRequest } from "../types";
import { holdForVerify, isThisName, verifyReason } from "../verifyCopy";
import { createAlert, severityForRisk, upsertEventAlert } from "./alerts";
import {
  collections,
  type CallAnalysisEvent,
  type CircleDoc,
  type MessageCheckEvent,
} from "./collections";
import { newId, nowIso } from "./http";

export type Action =
  | { type: "prompt_safe_word"; message: string }
  | { type: "verify_member"; member_id: string; verify_id: string; message?: string }
  | { type: "show_warning"; severity: "critical"; message: string };

const MONEY_CUES = ["bail", "money", "gift_cards", "wire", "crypto", "payment"];
const MONEY_WORDS = /\b(money|bail|gift ?cards?|wire|bitcoin|crypto|pay|cash)\b|\$\s?\d/i;

function asksForMoney(cues: string[], text: string) {
  return cues.some((cue) => MONEY_CUES.includes(cue)) || MONEY_WORDS.test(text);
}

function clampRisk(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, n));
}

export function riskOf(body: { risk?: unknown; scam_probability?: unknown }) {
  return clampRisk(body.risk ?? body.scam_probability);
}

function memberByClaimed(circle: CircleDoc, claimed: string | null | undefined) {
  if (!claimed) return undefined;
  const wanted = claimed.trim().toLowerCase();
  return circle.members.find(
    (member) => member.relation.toLowerCase() === wanted || member.name.toLowerCase() === wanted,
  );
}

function alertCopy(
  event: MessageCheckEvent | CallAnalysisEvent,
  claimed: CircleMember | undefined,
  moneyAsked: boolean,
) {
  const isCall = event.type === "call_analysis";
  const voice = isCall ? event.voice_synthetic_score ?? 0 : 0;
  const risk = event.risk;

  let title: string;
  if (isCall && voice > 0.7) title = "Possible voice-clone call to Nani";
  else if (risk >= 0.7) title = isCall ? "Likely scam call to Nani" : "Likely scam message to Nani";
  else if (risk >= 0.4) title = isCall ? "Suspicious call to Nani" : "Suspicious message to Nani";
  else title = isCall ? "Call checked — low risk" : "Message checked — low risk";

  const who = isCall ? "A caller" : "A message";
  let body: string;
  if (claimed) {
    body = `${who} claiming to be ${claimed.name} ${moneyAsked ? "asked for money" : "reached Nani"}.`;
  } else {
    body = event.explanation || (isCall ? event.transcript_snippet : event.text) || "ScamShield checked this.";
  }
  return { title, body };
}

async function ensureVerify(
  db: Db,
  circle: CircleDoc,
  member: CircleMember,
  event: MessageCheckEvent | CallAnalysisEvent,
): Promise<VerifyRequest> {
  const { verifies } = collections(db);
  // One question per call/message, even though chunks keep arriving.
  const existing = await verifies.findOne(
    { source_event_id: event.id, claimed_member_id: member.id },
    { projection: { _id: 0, seeded: 0 } },
  );
  if (existing) return existing;

  const now = Date.now();
  const verify: VerifyRequest = {
    id: newId("ver"),
    circle_id: circle.id,
    senior_id: circle.senior.id,
    claimed_member_id: member.id,
    claimed_member_name: member.name,
    reason: verifyReason(member.name, circle.senior.name, event.type === "call_analysis"),
    source_event_id: event.id,
    status: "pending",
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + circle.rules.verify_timeout_s * 1000).toISOString(),
    responded_at: null,
  };
  await verifies.insertOne({ ...verify });
  await createAlert(db, {
    circle_id: circle.id,
    kind: "verify",
    severity: "warning",
    title: `Asked ${member.name}: ${isThisName(member.name)}`,
    body: verify.reason,
    ref_id: verify.id,
  });
  return verify;
}

// Contract "Rules" section, applied to message_check and call_analysis alike.
export async function processEvent(
  db: Db,
  circle: CircleDoc,
  event: MessageCheckEvent | CallAnalysisEvent,
): Promise<Action[]> {
  await collections(db).events.insertOne({ ...event });

  const isCall = event.type === "call_analysis";
  if (isCall && event.manual_stop) {
    const { verifies, alerts } = collections(db);
    await verifies.updateMany(
      { source_event_id: event.id, status: "pending" },
      { $set: { status: "confirmed", responded_at: nowIso() } },
    );
    const existing = await alerts.findOne({ ref_id: event.id, kind: "call" });
    if (existing) {
      await alerts.updateOne(
        { id: existing.id },
        {
          $set: {
            severity: "info",
            title: "Call stopped — caller recognized",
            body: "Recording was stopped manually — the listener recognized the caller. This was not counted as a scam.",
            seen: true,
          },
        },
      );
    } else {
      await upsertEventAlert(db, {
        circle_id: circle.id,
        kind: "call",
        severity: "info",
        title: "Call stopped — caller recognized",
        body: "Recording was stopped manually — the listener recognized the caller. This was not counted as a scam.",
        ref_id: event.id,
      });
    }
    return [];
  }

  const cues = isCall ? event.script_cues ?? [] : event.red_flags ?? [];
  const text = isCall ? event.transcript_snippet ?? "" : event.text ?? "";
  const voice = isCall ? event.voice_synthetic_score ?? 0 : 0;
  const moneyAsked = asksForMoney(cues, text);

  const claimed = memberByClaimed(circle, event.claimed_identity);

  await upsertEventAlert(db, {
    circle_id: circle.id,
    kind: isCall ? "call" : "message",
    severity: severityForRisk(event.risk),
    ...alertCopy(event, claimed, moneyAsked),
    ref_id: event.id,
  });

  const actions: Action[] = [];
  const impersonatingCircle = Boolean(claimed) && event.risk >= 0.4;

  if (impersonatingCircle && circle.safe_word) {
    actions.push({
      type: "prompt_safe_word",
      message: "Ask the caller for your family safe word. If they cannot say it, hang up immediately.",
    });
  }

  if (impersonatingCircle && claimed?.can_verify) {
    const verify = await ensureVerify(db, circle, claimed, event);
    actions.push({
      type: "verify_member",
      member_id: claimed.id,
      verify_id: verify.id,
      message: holdForVerify(claimed.name, claimed.phone),
    });
  }

  if (event.risk >= 0.7) {
    actions.push({
      type: "show_warning",
      severity: "critical",
      message:
        voice > 0.7
          ? "This voice may be computer-generated."
          : "This looks like a scam. Don't send money or share codes.",
    });
  }

  return actions;
}

// Contract: expire past-due verifies before reading them; expiry is critical.
export async function expireVerifies(db: Db) {
  const { verifies } = collections(db);
  const now = nowIso();
  const stale = await verifies.find({ status: "pending", expires_at: { $lte: now } }).toArray();
  for (const verify of stale) {
    const result = await verifies.updateOne(
      { id: verify.id, status: "pending" },
      { $set: { status: "expired" } },
    );
    if (result.modifiedCount === 0) continue;
    await createAlert(db, {
      circle_id: verify.circle_id,
      kind: "verify",
      severity: "critical",
      title: `${verify.claimed_member_name} didn't answer in time`,
      body: "We treated it as unanswered and warned Nani to hang up.",
      ref_id: verify.id,
    });
  }
}
