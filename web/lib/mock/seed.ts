import type { Circle, CircleSettings, Payment, VerifyRequest } from "../types";
import { seedReports } from "./reports";
import {
  atlantaZips,
  campaigns,
  circleHealthWeeks,
  communitySummary,
  mutationPointsFor,
  scamTypeTotals,
  stateStats,
  warningNetworkFor,
} from "./community";

export const seedCircle: Circle = {
  id: "circle_nani",
  senior: { id: "u_nani", name: "Nani" },
  members: [
    {
      id: "u_aarav",
      name: "Aarav",
      relation: "grandson",
      phone: "+1 404 555 0111",
      email: "aarav@example.com",
      priority: 1,
      notify_via: ["app", "email"],
      can_verify: true,
    },
    {
      id: "u_priya",
      name: "Priya",
      relation: "daughter",
      phone: "+1 404 555 0112",
      email: "priya@example.com",
      priority: 2,
      notify_via: ["app", "email"],
      can_verify: true,
    },
    {
      id: "u_raj",
      name: "Uncle Raj",
      relation: "uncle",
      phone: "+1 404 555 0113",
      email: "raj@example.com",
      priority: 3,
      notify_via: ["email"],
      can_verify: false,
    },
  ],
  safe_word_set: true,
  safe_word_last_used_at: "2026-09-24T17:16:00Z",
  safe_word_last_result: "passed",
  health: {
    last_contact_days: 6,
    calls_this_week: 1,
    threats_caught_30d: 4,
    payments_held_30d: 1,
    dollars_protected_30d: 500,
  },
};

export const seedSettings: CircleSettings = {
  circle_id: "circle_nani",
  members: seedCircle.members,
  safe_word_set: true,
  rules: {
    prompt_safe_word_when: [
      "unknown_caller_asks_money",
      "voice_clone_score_above_0.7",
      "claims_family",
    ],
    verify_timeout_s: 30,
    hold_payments_after_flag_min: 30,
  },
};

export const seedPayments: Payment[] = [
  {
    id: "pay_001",
    circle_id: "circle_nani",
    senior_id: "u_nani",
    merchant: "Gift cards (online)",
    method: "gift_card",
    amount: 500,
    situation_risk: 0.91,
    top_factors: [
      { label: "Gift-card payment", weight: 0.35 },
      { label: "Minutes after a flagged call", weight: 0.3 },
      { label: "Aarav said NOT me", weight: 0.25 },
    ],
    status: "held",
    decided_by: null,
    created_at: "2026-09-25T18:54:00Z",
  },
];

export const seedVerifies: VerifyRequest[] = [
  {
    id: "ver_001",
    circle_id: "circle_nani",
    senior_id: "u_nani",
    claimed_member_id: "u_aarav",
    claimed_member_name: "Aarav",
    reason: "Someone claiming to be you is on a WhatsApp call with Nani right now.",
    source_event_id: "call_20260925_001",
    status: "denied",
    created_at: "2026-09-25T18:42:20Z",
    expires_at: "2026-09-25T18:42:50Z",
    responded_at: "2026-09-25T18:42:28Z",
  },
];

export const mutationPoints = Object.fromEntries(
  campaigns.map((campaign) => [campaign.id, mutationPointsFor(campaign)]),
);

export const warningNetworks = Object.fromEntries(
  campaigns.map((campaign) => [campaign.id, warningNetworkFor(campaign)]),
);

export function createSeedStore() {
  return {
    circle: seedCircle,
    settings: seedSettings,
    reports: [...seedReports],
    payments: [...seedPayments],
    verifies: [...seedVerifies],
    campaigns,
    mutationPoints,
    warningNetworks,
    map: atlantaZips,
    states: stateStats,
    summary: communitySummary,
    scamTypes: scamTypeTotals,
    healthWeeks: circleHealthWeeks,
  };
}

export type MockStoreData = ReturnType<typeof createSeedStore>;
