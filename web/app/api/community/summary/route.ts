import { getSummary } from "@/lib/server/community";
import { json } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function GET() {
  const db = await getSeededDb();
  return json(await getSummary(db));
}
