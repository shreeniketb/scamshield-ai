import type { NextRequest } from "next/server";
import { clean } from "@/lib/db";
import { collections } from "@/lib/server/collections";
import { json } from "@/lib/server/http";
import { expireVerifies } from "@/lib/server/rules";
import { getSeededDb } from "@/lib/server/seed";

export async function GET(request: NextRequest) {
  const memberId = request.nextUrl.searchParams.get("member_id");

  const db = await getSeededDb();
  await expireVerifies(db);
  const filter = memberId
    ? { claimed_member_id: memberId, status: "pending" as const }
    : { status: "pending" as const };
  const newest = await collections(db).verifies.findOne(filter, {
    ...clean,
    sort: { created_at: -1 },
  });
  return json(newest ?? null);
}
