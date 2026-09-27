import { loadCircle } from "@/lib/server/circle";
import { json, notFound } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getSeededDb();
  const circle = await loadCircle(db, id);
  if (!circle) return notFound("Unknown circle");
  return json(circle.health_weeks);
}
