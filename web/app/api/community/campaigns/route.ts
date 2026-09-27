import { createCampaignFromCall, getCampaigns } from "@/lib/server/community";
import { badRequest, json, readBody } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function GET() {
  const db = await getSeededDb();
  return json(await getCampaigns(db));
}

export async function POST(request: Request) {
  const body = await readBody<{ call_id?: string }>(request);
  if (!body?.call_id) return badRequest("call_id is required");
  const db = await getSeededDb();
  const campaign = await createCampaignFromCall(db, body.call_id);
  if (!campaign) return badRequest("No call found to warn the community about");
  return json({ ok: true, campaign });
}
