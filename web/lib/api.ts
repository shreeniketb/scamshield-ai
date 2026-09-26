import { incidentFromReport } from "./incident";
import { expireOldVerifies, getStore, setPendingVerify, updateVerify } from "./mock/store";
import { publishBus } from "./mock/bus";
import type {
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

async function realGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed: ${path}`);
  return response.json() as Promise<T>;
}

export async function getCircle(): Promise<Circle> {
  if (useMocks) return getStore().circle;
  return realGet<Circle>("/api/circle/circle_nani");
}

export async function getSettings(): Promise<CircleSettings> {
  if (useMocks) return getStore().settings;
  return realGet<CircleSettings>("/api/circle/circle_nani/settings");
}

export async function getIncidents(): Promise<Incident[]> {
  if (useMocks) {
    return getStore()
      .reports.map(incidentFromReport)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }
  return [];
}

export async function getIncident(id: string): Promise<Incident | null> {
  const all = await getIncidents();
  return all.find((item) => item.id === id) ?? null;
}

export async function getPayments(): Promise<Payment[]> {
  if (useMocks) return getStore().payments;
  return realGet<Payment[]>("/api/payments?circle_id=circle_nani");
}

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
  const body = await realGet<{ points: MutationPoint[] }>(
    `/api/community/campaigns/${id}/points`,
  );
  return body.points;
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
  return [];
}

export async function getWarningNetwork(
  campaignId: string,
): Promise<WarningNetwork | null> {
  if (useMocks) return getStore().warningNetworks[campaignId] ?? null;
  return null;
}

export async function getCircleHealthWeeks(): Promise<CircleHealthWeek[]> {
  if (useMocks) return getStore().healthWeeks;
  return [];
}

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
    await fetch(`/api/verify/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
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

export function triggerVoiceCloneVerify() {
  const now = Date.now();
  const verify: VerifyRequest = {
    id: `ver_live_${now}`,
    circle_id: "circle_nani",
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
