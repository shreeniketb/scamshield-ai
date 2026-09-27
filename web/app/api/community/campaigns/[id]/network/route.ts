import { getCampaignNetwork } from "@/lib/server/community";
import { json, notFound } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getSeededDb();
  const network = await getCampaignNetwork(db, id);
  if (!network) return notFound("Unknown campaign");
  return json(network);
}
