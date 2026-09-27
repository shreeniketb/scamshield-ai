import type {
  CallReport,
  CueChip,
  Detector,
  Incident,
  StoryStep,
} from "./types";

export function incidentFromReport(report: CallReport): Incident {
  const cues: CueChip[] = [];

  if (report.audio_forensics && report.audio_forensics.synthetic_probability > 0.7) {
    cues.push({
      group: "voice",
      label: "Likely computer-generated voice",
      explanation:
        "The voice on this call scored high as synthetic — it may be an AI copy of someone you know.",
      score: report.audio_forensics.synthetic_probability,
    });
  }

  for (const [key, meta] of Object.entries(report.signal_labels)) {
    const score = report.signals[key] ?? 0;
    if (score < 0.4) continue;
    cues.push({
      group: meta.group,
      label: meta.label,
      explanation: meta.explanation,
      score,
    });
  }

  const story_steps: StoryStep[] = [
    { time: 0, label: report.channel === "whatsapp_message" ? "Message received" : "Call started" },
    ...report.protection.actions_taken.map((action) => ({
      time: action.time,
      label: action.detail,
    })),
  ];

  if (report.protection.verification.status === "denied") {
    story_steps.push({
      time: report.protection.verification.responded_at_s ?? report.protection.verification.asked_at_s ?? 0,
      label: `${report.protection.verification.member_name} answered NOT me`,
    });
  }
  if (report.protection.verification.status === "confirmed") {
    story_steps.push({
      time: report.protection.verification.responded_at_s ?? 0,
      label: `${report.protection.verification.member_name} confirmed it was them`,
    });
  }
  if (report.protection.safe_word.result === "failed") {
    story_steps.push({
      time: report.protection.safe_word.asked_at_s ?? 0,
      label: "Caller could not give the family safe word",
    });
  }
  if (report.protection.safe_word.result === "passed") {
    story_steps.push({
      time: report.protection.safe_word.asked_at_s ?? 0,
      label: "Caller knew the family safe word",
    });
  }
  if (report.protection.senior_hung_up_at_s != null) {
    story_steps.push({
      time: report.protection.senior_hung_up_at_s,
      label: "Nani hung up",
    });
  }
  if (report.protection.linked_payment_id) {
    story_steps.push({
      time: (report.duration_s || 0) + 60,
      label: "Payment attempt paused for family",
    });
  }

  story_steps.sort((a, b) => a.time - b.time);

  const detectors: Detector[] = report.audio_forensics?.detectors ?? [];

  return {
    id: report.call_id,
    report,
    title: report.overall.outcome_label,
    channel: report.channel,
    started_at: report.started_at,
    duration_s: report.duration_s,
    caller_number: report.caller.number,
    risk_score: report.overall.risk_score,
    outcome_label: report.overall.outcome_label,
    family_summary: report.family_summary,
    story_steps,
    timeline: report.timeline,
    cues,
    detectors,
    transcript: report.transcript,
    evidence: report.evidence,
    campaign_id: report.community.campaign_id,
    campaign_name: report.community.campaign_name,
    is_demo: Boolean(report.seeded),
    scam_type_label: report.overall.scam_type_label,
    grok_action: report.recommended_action?.message || null,
  };
}
