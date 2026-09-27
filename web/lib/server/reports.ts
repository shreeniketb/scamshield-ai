import type { Db } from "mongodb";
import { clean } from "../db";
import { defaultSignalLabels } from "../mock/labels";
import type { CallReport, RiskLevel, TimelinePoint, VerifyRequest } from "../types";
import {
  collections,
  type CallAnalysisEvent,
  type CircleDoc,
  type MessageCheckEvent,
  type SafeWordEvent,
} from "./collections";
import { phoneKey } from "./http";
import { scamTypeInfo, signalForCue } from "./scamTypes";

const LIVE_WINDOW_MS = 2 * 60 * 1000;

function riskLevel(risk: number): RiskLevel {
  if (risk >= 0.7) return "HIGH";
  if (risk >= 0.4) return "MEDIUM";
  return "LOW";
}

function humanize(cue: string) {
  const text = cue.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Grok evidence times look like "0:21" or "1:02:05".
function callTimeToSeconds(time: string) {
  return time.split(":").reduce((total, part) => total * 60 + (Number(part) || 0), 0);
}

function emptySignals(): Record<string, number> {
  return Object.fromEntries(Object.keys(defaultSignalLabels).map((key) => [key, 0]));
}

function secondsBetween(fromIso: string, toIso: string) {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 100) / 10);
}

function durationFromChunks(
  chunks: CallAnalysisEvent[],
  transcript: CallReport["transcript"],
  startedAt: string,
) {
  const last = chunks[chunks.length - 1];
  if (last.duration_s && last.duration_s > 0) return last.duration_s;
  const fromTimes = Math.max(0, ...transcript.map((line) => line.end || line.start || 0));
  if (fromTimes > 0) return fromTimes;
  return secondsBetween(last.started_at ?? startedAt, last.created_at);
}

type Context = {
  circle: CircleDoc;
  verify: VerifyRequest | undefined;
  safeWord: SafeWordEvent | undefined;
};

function protectionFor(startedAt: string, ctx: Context): CallReport["protection"] {
  const { verify, safeWord } = ctx;
  const actions: CallReport["protection"]["actions_taken"] = [];
  if (verify) {
    actions.push({
      time: secondsBetween(startedAt, verify.created_at),
      type: "verify_member",
      detail: `Asked ${verify.claimed_member_name}: is this you?`,
      verify_id: verify.id,
    });
  }
  return {
    actions_taken: actions,
    verification: {
      verify_id: verify?.id ?? null,
      member_id: verify?.claimed_member_id ?? null,
      member_name: verify?.claimed_member_name ?? null,
      status: verify?.status ?? "not_asked",
      asked_at_s: verify ? secondsBetween(startedAt, verify.created_at) : null,
      responded_at_s: verify?.responded_at ? secondsBetween(startedAt, verify.responded_at) : null,
    },
    safe_word: {
      asked: Boolean(safeWord && safeWord.result !== "not_asked"),
      result: safeWord?.result ?? "not_asked",
      asked_at_s: safeWord ? secondsBetween(startedAt, safeWord.received_at) : null,
    },
    senior_hung_up_at_s: null,
    family_alerted: verify
      ? [{ member_id: verify.claimed_member_id, at_s: secondsBetween(startedAt, verify.created_at), via: "app" }]
      : [],
    linked_payment_id: null,
  };
}

function outcomeFor(risk: number, live: boolean, ctx: Context, isCall: boolean, claimedName: string | null) {
  const noun = isCall ? "call" : "message";
  const claim = claimedName ? ` claiming to be ${claimedName}` : "";
  if (ctx.verify?.status === "denied") {
    return { outcome: "stopped", outcome_label: `Scam ${noun}${claim} stopped · NOT me` };
  }
  if (ctx.safeWord?.result === "failed") {
    return { outcome: "stopped", outcome_label: `Scam ${noun} stopped · safe word failed` };
  }
  if (ctx.safeWord?.result === "passed" || ctx.verify?.status === "confirmed") {
    return { outcome: "verified", outcome_label: `${isCall ? "Caller" : "Sender"} verified by family` };
  }
  if (live && isCall) return { outcome: "in_progress", outcome_label: `Live call from unknown number${claim}` };
  if (risk >= 0.7) return { outcome: "flagged", outcome_label: `Likely scam ${noun}${claim} flagged` };
  if (risk >= 0.4) return { outcome: "flagged", outcome_label: `Suspicious ${noun}${claim}` };
  return { outcome: "low_risk", outcome_label: `${isCall ? "Call" : "Message"} checked · low risk` };
}

// Builds an Activity entry from the live call_analysis chunks, for calls where
// the desktop app hasn't sent (or won't send) a full call_report.
export function reportFromCallChunks(chunks: CallAnalysisEvent[], ctx: Context): CallReport {
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startedAt = first.created_at;
  const live = Date.now() - Date.parse(last.received_at) < LIVE_WINDOW_MS;
  const risk = Math.max(...sorted.map((chunk) => chunk.risk));
  const voiceScores = sorted
    .map((chunk) => chunk.voice_synthetic_score)
    .filter((score): score is number => typeof score === "number");
  const claimedIdentity = sorted.map((chunk) => chunk.claimed_identity).find(Boolean) ?? null;
  const claimedMember = ctx.circle.members.find(
    (member) => member.relation.toLowerCase() === claimedIdentity?.toLowerCase(),
  );
  // The contract's call_analysis has no scam_type; a caller posing as family is the grandparent scam.
  const scamType = last.scam_type ?? (claimedMember ? "family_impersonation" : undefined);
  const scam = scamTypeInfo(scamType);
  const callerMember = ctx.circle.members.find(
    (member) => phoneKey(member.phone) === phoneKey(first.caller),
  );

  const signals = emptySignals();
  const seenCues = new Set<string>();
  const timeline: TimelinePoint[] = [];
  for (const chunk of sorted) {
    const newCues = (chunk.script_cues ?? []).filter((cue) => !seenCues.has(cue));
    for (const cue of chunk.script_cues ?? []) {
      seenCues.add(cue);
      const key = signalForCue(cue);
      if (key) signals[key] = Math.max(signals[key] ?? 0, chunk.risk, 0.6);
    }
    timeline.push({
      time: secondsBetween(startedAt, chunk.created_at),
      risk: chunk.risk,
      voice_synthetic: chunk.voice_synthetic_score ?? null,
      trigger: newCues[0] ?? "analysis",
      label: newCues.length ? humanize(newCues[0]) : "",
    });
  }

  const fullTranscript = last.transcript
    ? last.transcript
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          const match = line.match(/^\[([^\]]+)\]\s+(user|caller|unknown):\s*(.*)$/i);
          return {
            start: match ? callTimeToSeconds(match[1]) : index * 3,
            end: (match ? callTimeToSeconds(match[1]) : index * 3) + 3,
            speaker: (match?.[2]?.toLowerCase() === "user" ? "senior" : "caller") as "senior" | "caller",
            text: match?.[3] ?? line,
          };
        })
    : sorted
        .filter((chunk) => chunk.transcript_snippet)
        .map((chunk) => {
          const start = secondsBetween(startedAt, chunk.created_at);
          return { start, end: start + 3, speaker: "caller" as const, text: chunk.transcript_snippet ?? "" };
        });
  const transcript = fullTranscript;

  const evidence = sorted
    .filter((chunk) => chunk.transcript_snippet && (chunk.script_cues ?? []).length > 0)
    .map((chunk) => {
      const start = secondsBetween(startedAt, chunk.created_at);
      const cue = (chunk.script_cues ?? [])[0];
      return {
        type: signalForCue(cue) ?? cue,
        confidence: chunk.risk,
        text: chunk.transcript_snippet ?? "",
        start,
        end: start + 3,
      };
    });

  // Grok re-reads the whole call each time, so the latest chunk's reasons are the full picture.
  for (const reason of last.reasons ?? []) {
    for (const quote of reason.evidence) {
      const start = callTimeToSeconds(quote.time);
      evidence.push({
        type: signalForCue(reason.category) ?? reason.category,
        confidence: risk,
        text: quote.quote,
        start,
        end: start + 3,
      });
    }
  }

  const topVoice = voiceScores.length ? Math.max(...voiceScores) : null;

  return {
    schema_version: "1.1",
    call_id: first.id,
    circle_id: first.circle_id,
    senior_id: first.senior_id,
    channel: "whatsapp_call",
    direction: "incoming",
    caller: {
      number: first.caller,
      display_name: callerMember?.name ?? null,
      known_contact: Boolean(callerMember),
      matched_member_id: callerMember?.id ?? null,
      caller_id_status: (first.caller_id_status as CallReport["caller"]["caller_id_status"]) ?? "not_applicable",
      profile_photo_matches_member: null,
    },
    started_at: first.started_at ?? startedAt,
    ended_at: live ? null : last.created_at,
    duration_s: durationFromChunks(sorted, transcript, startedAt),
    language: "en",
    status: live ? "in_progress" : "ended",
    overall: {
      risk_score: risk,
      risk_level: riskLevel(risk),
      scam_type: scamType ?? "unknown",
      scam_type_label: scam.label,
      scam_type_confidence: risk,
      ...outcomeFor(risk, live, ctx, true, claimedMember?.name ?? null),
    },
    audio_forensics:
      topVoice === null
        ? undefined
        : {
            synthetic_probability: topVoice,
            classification: topVoice > 0.7 ? "likely_synthetic" : "likely_human",
            model_confidence: topVoice,
            manipulation_type: last.manipulation_type ?? "unknown",
            detectors: [],
          },
    transcript,
    signals,
    signal_labels: defaultSignalLabels,
    entities: {
      claimed_identity: claimedIdentity,
      claimed_member_id: claimedMember?.id ?? null,
      claimed_organization: last.claimed_organization ?? null,
      requested_amount: sorted.map((chunk) => chunk.requested_amount).find((n) => n != null) ?? null,
      currency: "USD",
      payment_method:
        sorted.map((chunk) => chunk.payment_method).find(Boolean) ??
        (seenCues.has("gift_cards") ? "gift_cards" : null),
      requested_action: null,
      deadline: null,
    },
    evidence,
    timeline,
    protection: protectionFor(startedAt, ctx),
    community: {
      reported: risk >= 0.6,
      campaign_id: scam.campaign_id,
      campaign_name: null,
      similar_reports_24h: 0,
    },
    recommended_action: {
      severity: risk >= 0.7 ? "urgent" : risk >= 0.4 ? "caution" : "info",
      message: last.recommended_action ?? "",
    },
    report_summary: last.explanation ?? "",
    family_summary:
      last.explanation ??
      `ScamShield checked a WhatsApp call to ${ctx.circle.senior.name} (risk ${Math.round(risk * 100)}%).`,
  };
}

export function reportFromMessage(event: MessageCheckEvent, ctx: Context): CallReport {
  const scam = scamTypeInfo(event.scam_type);
  const claimedMember = ctx.circle.members.find(
    (member) => member.relation.toLowerCase() === event.claimed_identity?.toLowerCase(),
  );
  const signals = emptySignals();
  for (const flag of event.red_flags ?? []) {
    const key = signalForCue(flag.replace(/\s+/g, "_"));
    if (key) signals[key] = Math.max(signals[key] ?? 0, event.risk);
  }
  return {
    schema_version: "1.1",
    call_id: event.id,
    circle_id: event.circle_id,
    senior_id: event.senior_id,
    channel: "whatsapp_message",
    direction: "incoming",
    caller: {
      number: event.sender,
      display_name: null,
      known_contact: false,
      matched_member_id: null,
      caller_id_status: "not_applicable",
      profile_photo_matches_member: null,
    },
    started_at: event.created_at,
    ended_at: event.created_at,
    duration_s: 0,
    language: "en",
    status: "ended",
    overall: {
      risk_score: event.risk,
      risk_level: riskLevel(event.risk),
      scam_type: event.scam_type ?? "unknown",
      scam_type_label: scam.label,
      scam_type_confidence: event.risk,
      ...outcomeFor(event.risk, false, ctx, false, claimedMember?.name ?? null),
    },
    transcript: [{ start: 0, end: 0, speaker: "caller", text: event.text }],
    signals,
    signal_labels: defaultSignalLabels,
    entities: {
      claimed_identity: event.claimed_identity ?? null,
      claimed_member_id: claimedMember?.id ?? null,
      claimed_organization: null,
      requested_amount: null,
      currency: "USD",
      payment_method: null,
      requested_action: null,
      deadline: null,
    },
    evidence: [],
    timeline: [],
    protection: protectionFor(event.created_at, ctx),
    community: {
      reported: event.risk >= 0.6,
      campaign_id: scam.campaign_id,
      campaign_name: null,
      similar_reports_24h: 0,
    },
    recommended_action: { severity: event.risk >= 0.7 ? "urgent" : "info", message: "" },
    report_summary: event.explanation ?? "",
    family_summary: event.explanation ?? `ScamShield checked a WhatsApp message to ${ctx.circle.senior.name}.`,
  };
}

// Stored call reports plus Activity entries built from events that have no
// final report yet. Newest first.
export async function listReports(db: Db, circle: CircleDoc): Promise<CallReport[]> {
  const c = collections(db);
  const [stored, events, verifies] = await Promise.all([
    c.reports.find({ circle_id: circle.id }, clean).toArray(),
    c.events.find({}, clean).toArray(),
    c.verifies.find({ circle_id: circle.id }, clean).toArray(),
  ]);

  const reported = new Set(stored.map((report) => report.call_id));
  const safeWords = new Map<string, SafeWordEvent>();
  const calls = new Map<string, CallAnalysisEvent[]>();
  const messages: MessageCheckEvent[] = [];

  for (const event of events) {
    if (event.type === "safe_word_result") safeWords.set(event.call_id, event);
    else if (event.circle_id !== circle.id || reported.has(event.id)) continue;
    else if (event.type === "call_analysis") calls.set(event.id, [...(calls.get(event.id) ?? []), event]);
    else messages.push(event);
  }

  const contextFor = (id: string): Context => ({
    circle,
    verify: verifies.find((verify) => verify.source_event_id === id),
    safeWord: safeWords.get(id),
  });

  const built = [
    ...[...calls.entries()].map(([id, chunks]) => reportFromCallChunks(chunks, contextFor(id))),
    ...messages.map((message) => reportFromMessage(message, contextFor(message.id))),
  ];

  return [...stored, ...built].sort((a, b) => b.started_at.localeCompare(a.started_at));
}
