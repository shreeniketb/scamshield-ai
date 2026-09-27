import { clean } from "@/lib/db";
import { collections } from "@/lib/server/collections";
import { json, notFound } from "@/lib/server/http";
import { expireVerifies } from "@/lib/server/rules";
import { getSeededDb } from "@/lib/server/seed";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getSeededDb();
  await expireVerifies(db);
  const verify = await collections(db).verifies.findOne({ id }, clean);
  return verify ? json(verify) : notFound("Unknown verify request");
}
