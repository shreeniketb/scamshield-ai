export type CallerIdStatus = "passed" | "failed" | "not_verified" | "not_applicable";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type VerifyStatus = "pending" | "confirmed" | "denied" | "expired";
export type PaymentStatus = "held" | "auto_ok" | "approved" | "declined";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertKind = "message" | "call" | "verify" | "payment" | "campaign";
export type CampaignSeverity = "info" | "warning" | "critical";
export type SignalGroup = "voice" | "words" | "caller" | "money";
export type Channel = "whatsapp_call" | "whatsapp_message";

export type CircleMember = {
  id: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
  priority: number;
  notify_via: Array<"app" | "email">;
  can_verify: boolean;
};

export type CircleRules = {
  prompt_safe_word_when: string[];
  verify_timeout_s: number;
  hold_payments_after_flag_min: number;
};

export type CircleSettings = {
  circle_id: string;
  members: CircleMember[];
  safe_word_set: boolean;
  rules: CircleRules;
};

export type CircleHealth = {
  last_contact_days: number;
  calls_this_week: number;
  threats_caught_30d: number;
  payments_held_30d: number;
  dollars_protected_30d: number;
};

export type Circle = {
  id: string;
  senior: { id: string; name: string };
  members: CircleMember[];
  safe_word_set: boolean;
  safe_word_last_used_at: string | null;
  safe_word_last_result: "passed" | "failed" | null;
  health: CircleHealth;
};

export type CircleHealthWeek = {
  week_label: string;
  calls: number;
};

export type VerifyRequest = {
  id: string;
  circle_id: string;
  senior_id: string;
  claimed_member_id: string;
  claimed_member_name: string;
  reason: string;
  source_event_id: string;
  status: VerifyStatus;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type PaymentFactor = { label: string; weight: number };

export type Payment = {
  id: string;
  circle_id: string;
  senior_id: string;
  merchant: string;
  method: string;
  amount: number;
  situation_risk: number;
  top_factors: PaymentFactor[];
  status: PaymentStatus;
  decided_by: string | null;
  created_at: string;
};

export type Alert = {
  id: string;
  circle_id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  ref_id: string;
  created_at: string;
  seen: boolean;
};

export type Detector = {
  name: string;
  family: string;
  score: number | null;
  ran: boolean;
  finding: string;
};

export type TranscriptLine = {
  start: number;
  end: number;
  speaker: "caller" | "senior";
  text: string;
};

export type SignalLabel = {
  group: SignalGroup;
  label: string;
  explanation: string;
};

export type Evidence = {
  type: string;
  confidence: number;
  text: string;
  start: number;
  end: number;
};

export type TimelinePoint = {
  time: number;
  risk: number;
  voice_synthetic: number | null;
  trigger: string;
  label: string;
};

export type ProtectionAction = {
  time: number;
  type: string;
  detail: string;
  verify_id?: string;
};

export type CallReport = {
  schema_version: string;
  call_id: string;
  circle_id: string;
  senior_id: string;
  channel: Channel;
  direction: "incoming" | "outgoing";
  caller: {
    number: string;
    display_name: string | null;
    known_contact: boolean;
    matched_member_id: string | null;
    caller_id_status: CallerIdStatus;
    profile_photo_matches_member: string | null;
  };
  started_at: string;
  ended_at: string | null;
  duration_s: number;
  language: string;
  status: "ended" | "in_progress";
  overall: {
    risk_score: number;
    risk_level: RiskLevel;
    scam_type: string;
    scam_type_label: string;
    scam_type_confidence: number;
    outcome: string;
    outcome_label: string;
  };
  audio_forensics?: {
    synthetic_probability: number;
    classification: string;
    model_confidence: number;
    manipulation_type: string;
    detectors: Detector[];
  };
  transcript: TranscriptLine[];
  signals: Record<string, number>;
  signal_labels: Record<string, SignalLabel>;
  entities: {
    claimed_identity: string | null;
    claimed_member_id: string | null;
    claimed_organization: string | null;
    requested_amount: number | null;
    currency: string | null;
    payment_method: string | null;
    requested_action: string | null;
    deadline: string | null;
  };
  evidence: Evidence[];
  timeline: TimelinePoint[];
  protection: {
    actions_taken: ProtectionAction[];
    verification: {
      verify_id: string | null;
      member_id: string | null;
      member_name: string | null;
      status: VerifyStatus | "not_asked";
      asked_at_s: number | null;
      responded_at_s: number | null;
    };
    safe_word: {
      asked: boolean;
      result: "passed" | "failed" | "not_asked";
      asked_at_s: number | null;
    };
    senior_hung_up_at_s: number | null;
    family_alerted: Array<{ member_id: string; at_s: number; via: string }>;
    linked_payment_id: string | null;
  };
  community: {
    reported: boolean;
    campaign_id: string | null;
    campaign_name: string | null;
    similar_reports_24h: number;
  };
  recommended_action: {
    severity: string;
    message: string;
  };
  report_summary: string;
  family_summary: string;
};

export type CueChip = {
  group: SignalGroup;
  label: string;
  explanation: string;
  score: number;
};

export type StoryStep = {
  time: number;
  label: string;
};

export type Incident = {
  id: string;
  report: CallReport;
  title: string;
  channel: Channel;
  started_at: string;
  duration_s: number;
  caller_number: string;
  risk_score: number;
  outcome_label: string;
  family_summary: string;
  story_steps: StoryStep[];
  timeline: TimelinePoint[];
  cues: CueChip[];
  detectors: Detector[];
  transcript: TranscriptLine[];
  evidence: Evidence[];
  campaign_id: string | null;
  campaign_name: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  channels: string[];
  reports_24h: number;
  trend: number[];
  first_seen: string;
  areas: string[];
  example_redacted: string;
  how_to_spot: string;
  severity: CampaignSeverity;
  variant_names: string[];
};

export type MutationPoint = {
  x: number;
  y: number;
  variant: number;
  text_redacted: string;
  first_seen: string;
  zip: string;
};

export type MapZip = {
  zip: string;
  lat: number;
  lon: number;
  reports_24h: number;
  neighborhood: string;
};

export type StateStat = {
  state: string;
  losses_usd: number;
  complaints: number;
  placeholder: true;
};

export type WarningNode = {
  id: string;
  ring: 0 | 1 | 2;
  status: "first" | "warned" | "before" | "after" | "outside";
  label: string;
};

export type WarningEdge = { from: string; to: string };

export type WarningNetwork = {
  campaign_id: string;
  insight: string;
  nodes: WarningNode[];
  edges: WarningEdge[];
};

export type CommunitySummary = {
  active_campaigns_24h: number;
  circles_warned_before_exposure: number;
  payments_held: number;
  dollars_protected: number;
  voice_clones_caught: number;
  data_label: "Demo data";
};

export type ScamTypeTotal = {
  type: string;
  reports: number;
};

export type BusMessage =
  | { type: "verify_pending"; verify: VerifyRequest }
  | { type: "verify_updated"; verify: VerifyRequest }
  | { type: "store_updated" };
