import { campaigns, warningNetworkFor } from "@/lib/mock/community";
import { json, notFound } from "@/lib/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = campaigns.find((item) => item.id === id);
  if (!campaign) return notFound("Unknown campaign");
  return json(warningNetworkFor(campaign));
}
