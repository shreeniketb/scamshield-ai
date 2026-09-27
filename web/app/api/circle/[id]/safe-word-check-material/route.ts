import { collections } from "@/lib/server/collections";
import { json, notFound } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

// Only Nani's desktop app may read the safe word (header X-Device-Token).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const expected = process.env.DEVICE_TOKEN;
  const token = request.headers.get("x-device-token");
  if (!expected || token !== expected) return json({ ok: false, error: "Unauthorized" }, 401);

  const { id } = await params;
  const db = await getSeededDb();
  const circle = await collections(db).circles.findOne({ id });
  if (!circle) return notFound("Unknown circle");
  return json({ safe_word: circle.safe_word });
}
