import type { Db } from "mongodb";
import type {
  Alert,
  CallReport,
  CircleHealthWeek,
  CircleMember,
  CircleRules,
  Payment,
  VerifyRequest,
} from "../types";

// The circle as stored. safe_word never leaves the server except through
// /safe-word-check-material (device token required).
export type CircleDoc = {
  id: string;
  senior: { id: string; name: string };
  zip: string;
  members: CircleMember[];
  rules: CircleRules;
  safe_word: string | null;
  safe_word_last_used_at: string | null;
  safe_word_last_result: "passed" | "failed" | null;
  last_family_call_at: string;
  health_weeks: CircleHealthWeek[];
};

export type MessageCheckEvent = {
  type: "message_check";
  id: string;
  circle_id: string;
  senior_id: string;
  channel: string;
  sender: string;
  text: string;
  scam_probability: number;
  scam_type?: string;
  red_flags?: string[];
  explanation?: string;
  claimed_identity?: string | null;
  created_at: string;
  received_at: string;
  risk: number;
};

export type CallAnalysisEvent = {
  type: "call_analysis";
  id: string;
  circle_id: string;
  senior_id: string;
  channel: string;
  caller: string;
  caller_id_status?: string;
  chunk_index: number;
  voice_synthetic_score?: number | null;
  manipulation_type?: string | null;
  transcript_snippet?: string;
  script_cues?: string[];
  claimed_identity?: string | null;
  risk: number;
  scam_type?: string;
  explanation?: string;
  recommended_action?: string;
  created_at: string;
  received_at: string;
};

export type SafeWordEvent = {
  type: "safe_word_result";
  id: string;
  call_id: string;
  result: "passed" | "failed" | "not_asked";
  received_at: string;
};

export type EventDoc = MessageCheckEvent | CallAnalysisEvent | SafeWordEvent;

type Seeded = { seeded?: boolean };

export function collections(db: Db) {
  return {
    circles: db.collection<CircleDoc>("circles"),
    events: db.collection<EventDoc>("events"),
    reports: db.collection<CallReport & Seeded>("call_reports"),
    alerts: db.collection<Alert>("alerts"),
    verifies: db.collection<VerifyRequest & Seeded>("verifies"),
    payments: db.collection<Payment & Seeded>("payments"),
  };
}
