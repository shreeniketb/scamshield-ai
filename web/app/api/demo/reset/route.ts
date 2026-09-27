import { getDb } from "@/lib/db";
import { json } from "@/lib/server/http";
import { resetDemo } from "@/lib/server/seed";

export async function POST() {
  await resetDemo(await getDb());
  return json({ ok: true });
}
