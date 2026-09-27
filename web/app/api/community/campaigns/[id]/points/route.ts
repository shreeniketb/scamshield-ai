import { getCampaignPoints } from "@/lib/server/community";
import { json, notFound } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getSeededDb();
  const points = await getCampaignPoints(db, id);
  if (!points) return notFound("Unknown campaign");
  return json({ campaign_id: id, points });
}
