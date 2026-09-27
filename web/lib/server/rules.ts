import type { Db } from "mongodb";
import type { CircleMember, VerifyRequest } from "../types";
import { createAlert, severityForRisk, upsertEventAlert } from "./alerts";
import {
  collections,
  type CallAnalysisEvent,
  type CircleDoc,
  type MessageCheckEvent,
} from "./collections";
import { newId, nowIso, phoneKey } from "./http";

export type Action =
  | { type: "prompt_safe_word"; message: string }
  | { type: "verify_member"; member_id: string; verify_id: string }
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

function memberByRelation(circle: CircleDoc, claimed: string | null | undefined) {
  if (!claimed) return undefined;
  const wanted = claimed.trim().toLowerCase();
  return circle.members.find((member) => member.relation.toLowerCase() === wanted);
}

function memberByPhone(circle: CircleDoc, phone: string) {
  const key = phoneKey(phone);
  if (!key) return undefined;
  return circle.members.find((member) => phoneKey(member.phone) === key);
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
    reason:
      event.type === "call_analysis"
        ? `Someone claiming to be you is on a WhatsApp call with ${circle.senior.name} right now.`
        : `Someone claiming to be you just messaged ${circle.senior.name} asking for help.`,
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
    title: `Asked ${member.name}: is this you?`,
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
  const cues = isCall ? event.script_cues ?? [] : event.red_flags ?? [];
  const text = isCall ? event.transcript_snippet ?? "" : event.text ?? "";
  const from = isCall ? event.caller : event.sender;
  const voice = isCall ? event.voice_synthetic_score ?? 0 : 0;
  const moneyAsked = asksForMoney(cues, text);

  const claimed = memberByRelation(circle, event.claimed_identity);
  const callerIsMember = memberByPhone(circle, from);

  await upsertEventAlert(db, {
    circle_id: circle.id,
    kind: isCall ? "call" : "message",
    severity: severityForRisk(event.risk),
    ...alertCopy(event, claimed, moneyAsked),
    ref_id: event.id,
  });

  const actions: Action[] = [];
  const method = circle.rules.protection_method ?? "verify_member";

  if (method === "safe_word" && circle.safe_word) {
    const rules = circle.rules.prompt_safe_word_when;
    const matches =
      (rules.includes("unknown_caller_asks_money") && !callerIsMember && moneyAsked) ||
      (rules.includes("voice_clone_score_above_0.7") && voice > 0.7) ||
      (rules.includes("claims_family") && Boolean(event.claimed_identity)) ||
      rules.length === 0;
    if (matches) {
      actions.push({
        type: "prompt_safe_word",
        message: "Ask the caller for your family safe word. If they cannot say it, hang up immediately.",
      });
    }
  }

  if (method === "verify_member") {
    let verifyTarget: CircleMember | undefined;
    if (claimed?.can_verify && event.risk >= 0.6) verifyTarget = claimed;
    else if (callerIsMember?.can_verify && moneyAsked) verifyTarget = callerIsMember;
    if (verifyTarget) {
      const verify = await ensureVerify(db, circle, verifyTarget, event);
      actions.push({ type: "verify_member", member_id: verifyTarget.id, verify_id: verify.id });
    }
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
