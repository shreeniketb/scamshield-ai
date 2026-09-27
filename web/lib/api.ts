import { incidentFromReport } from "./incident";
import {
  expireOldVerifies,
  getStore,
  resetStore,
  setPendingVerify,
  updatePayment,
  updateSettings,
  updateVerify,
} from "./mock/store";
import { publishBus } from "./mock/bus";
import type {
  Alert,
  CallReport,
  Campaign,
  Circle,
  CircleHealthWeek,
  CircleSettings,
  CommunitySummary,
  Incident,
  MapZip,
  MutationPoint,
  Payment,
  ScamTypeTotal,
  StateStat,
  VerifyRequest,
  WarningNetwork,
} from "./types";

const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
const CIRCLE = "circle_nani";

export function isMockMode() {
  return useMocks;
}

// Server components need a full URL to reach our own /api routes.
function apiUrl(path: string) {
  if (typeof window !== "undefined") return path;
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT ?? 3000}`;
  return origin + path;
}

async function realGet<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed: ${path}`);
  return response.json() as Promise<T>;
}

async function realSend<T>(method: "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed: ${method} ${path}`);
  return response.json() as Promise<T>;
}

// ── Circle ────────────────────────────────────────────────────────────────

export async function getCircle(): Promise<Circle> {
  if (useMocks) return getStore().circle;
  return realGet<Circle>(`/api/circle/${CIRCLE}`);
}

export async function getSettings(): Promise<CircleSettings> {
  if (useMocks) return getStore().settings;
  return realGet<CircleSettings>(`/api/circle/${CIRCLE}/settings`);
}

export async function saveSettings(
  changes: Partial<Pick<CircleSettings, "members" | "rules">>,
): Promise<CircleSettings> {
  if (useMocks) return updateSettings(changes);
  return realSend<CircleSettings>("PUT", `/api/circle/${CIRCLE}/settings`, changes);
}

export async function setSafeWord(safeWord: string): Promise<void> {
  if (useMocks) {
    updateSettings({ safe_word_set: true });
    return;
  }
  await realSend("PUT", `/api/circle/${CIRCLE}/safe-word`, { safe_word: safeWord });
}

export async function getCircleHealthWeeks(): Promise<CircleHealthWeek[]> {
  if (useMocks) return getStore().healthWeeks;
  return realGet<CircleHealthWeek[]>(`/api/circle/${CIRCLE}/health-weeks`);
}

// ── Activity ──────────────────────────────────────────────────────────────

export async function getIncidents(): Promise<Incident[]> {
  const reports = useMocks
    ? getStore().reports
    : await realGet<CallReport[]>(`/api/reports?circle_id=${CIRCLE}`);
  return reports.map(incidentFromReport).sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export async function getIncident(id: string): Promise<Incident | null> {
  const all = await getIncidents();
  return all.find((item) => item.id === id) ?? null;
}

export async function getAlerts(): Promise<Alert[]> {
  if (useMocks) return [];
  return realGet<Alert[]>(`/api/alerts?circle_id=${CIRCLE}`);
}

// ── Payments ──────────────────────────────────────────────────────────────

export async function getPayments(): Promise<Payment[]> {
  if (useMocks) return getStore().payments;
  return realGet<Payment[]>(`/api/payments?circle_id=${CIRCLE}`);
}

export async function decidePayment(
  id: string,
  memberId: string,
  decision: "approved" | "declined",
): Promise<Payment | null> {
  if (useMocks) return updatePayment(id, { status: decision, decided_by: memberId });
  return realSend<Payment>("POST", `/api/payments/${id}/decide`, { member_id: memberId, decision });
}

export async function attemptPayment(input: {
  merchant: string;
  method: string;
  amount: number;
}): Promise<Payment> {
  return realSend<Payment>("POST", "/api/payments/attempt", {
    circle_id: CIRCLE,
    senior_id: "u_nani",
    ...input,
  });
}

// ── Community ─────────────────────────────────────────────────────────────

export async function getCampaigns(): Promise<Campaign[]> {
  if (useMocks) return getStore().campaigns;
  return realGet<Campaign[]>("/api/community/campaigns");
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const all = await getCampaigns();
  return all.find((item) => item.id === id) ?? null;
}

export async function getCampaignPoints(id: string): Promise<MutationPoint[]> {
  if (useMocks) return getStore().mutationPoints[id] ?? [];
  const body = await realGet<{ points: MutationPoint[] }>(`/api/community/campaigns/${id}/points`);
  return body.points;
}

export async function getWarningNetwork(campaignId: string): Promise<WarningNetwork | null> {
  if (useMocks) return getStore().warningNetworks[campaignId] ?? null;
  return realGet<WarningNetwork>(`/api/community/campaigns/${campaignId}/network`);
}

export async function getMap(): Promise<MapZip[]> {
  if (useMocks) return getStore().map;
  return realGet<MapZip[]>("/api/community/map");
}

export async function getStates(): Promise<StateStat[]> {
  if (useMocks) return getStore().states;
  return realGet<StateStat[]>("/api/community/states");
}

export async function getCommunitySummary(): Promise<CommunitySummary> {
  if (useMocks) return getStore().summary;
  return realGet<CommunitySummary>("/api/community/summary");
}

export async function getScamTypes(): Promise<ScamTypeTotal[]> {
  if (useMocks) return getStore().scamTypes;
  return realGet<ScamTypeTotal[]>("/api/community/scam-types");
}

// ── Verification ("Is this you?") ─────────────────────────────────────────

export async function getPendingVerify(memberId: string): Promise<VerifyRequest | null> {
  if (!useMocks) {
    return realGet<VerifyRequest | null>(`/api/verify/pending?member_id=${memberId}`);
  }
  expireOldVerifies();
  const now = Date.now();
  const pending = getStore()
    .verifies.filter(
      (item) =>
        item.claimed_member_id === memberId &&
        item.status === "pending" &&
        Date.parse(item.expires_at) > now,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return pending[0] ?? null;
}

export async function respondVerify(id: string, response: "me" | "not_me") {
  if (!useMocks) {
    await realSend("POST", `/api/verify/${id}/respond`, { response });
    return;
  }
  const existing = getStore().verifies.find((item) => item.id === id);
  if (!existing) return;
  const updated: VerifyRequest = {
    ...existing,
    status: response === "me" ? "confirmed" : "denied",
    responded_at: new Date().toISOString(),
  };
  updateVerify(updated);
}

// ── Demo ──────────────────────────────────────────────────────────────────

// Real mode posts the contract's example call_analysis event, exactly as
// Kale's desktop app would; the server then asks Aarav "Is this you?".
export async function triggerVoiceCloneVerify(): Promise<{ id: string }> {
  const now = Date.now();
  if (!useMocks) {
    const result = await realSend<{ actions: Array<{ type: string; verify_id?: string }> }>(
      "POST",
      "/api/events/call_analysis",
      {
        id: `call_demo_${now}`,
        circle_id: CIRCLE,
        senior_id: "u_nani",
        channel: "whatsapp_call",
        caller: "+1 678 555 0142",
        caller_id_status: "not_applicable",
        chunk_index: 3,
        voice_synthetic_score: 0.87,
        manipulation_type: "tts",
        transcript_snippet: "it's me grandma, I'm on a friend's phone, I need bail money",
        script_cues: ["claimed_family", "new_number_excuse", "bail", "secrecy"],
        claimed_identity: "grandson",
        risk: 0.9,
        scam_type: "family_impersonation",
        created_at: new Date(now).toISOString(),
      },
    );
    const verify = result.actions.find((action) => action.type === "verify_member");
    return { id: verify?.verify_id ?? "none" };
  }

  const verify: VerifyRequest = {
    id: `ver_live_${now}`,
    circle_id: CIRCLE,
    senior_id: "u_nani",
    claimed_member_id: "u_aarav",
    claimed_member_name: "Aarav",
    reason: "Someone claiming to be you is on a WhatsApp call with Nani right now.",
    source_event_id: "call_20260925_001",
    status: "pending",
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 30_000).toISOString(),
    responded_at: null,
  };
  setPendingVerify(verify);
  publishBus({ type: "verify_pending", verify });
  return verify;
}

export async function resetDemo(): Promise<void> {
  if (useMocks) {
    resetStore();
    return;
  }
  await realSend("POST", "/api/demo/reset");
}
