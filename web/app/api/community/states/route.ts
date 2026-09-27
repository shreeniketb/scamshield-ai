import { getStates } from "@/lib/server/community";
import { json } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

// FBI IC3 2025 elder fraud (age 60+), stored in MongoDB community_states.
export async function GET() {
  const db = await getSeededDb();
  return json(await getStates(db));
}
