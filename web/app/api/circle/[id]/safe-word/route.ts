import { collections } from "@/lib/server/collections";
import { badRequest, json, notFound, readBody } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody<{ safe_word?: string }>(request);
  const word = body?.safe_word?.trim();
  if (!word || word.length < 2) return badRequest("safe_word must be at least 2 characters");

  const db = await getSeededDb();
  const result = await collections(db).circles.updateOne({ id }, { $set: { safe_word: word } });
  if (result.matchedCount === 0) return notFound("Unknown circle");
  return json({ ok: true, safe_word_set: true });
}
