import type { NextRequest } from "next/server";
import { clean } from "@/lib/db";
import { collections } from "@/lib/server/collections";
import { badRequest, json } from "@/lib/server/http";
import { expireVerifies } from "@/lib/server/rules";
import { getSeededDb } from "@/lib/server/seed";

export async function GET(request: NextRequest) {
  const memberId = request.nextUrl.searchParams.get("member_id");
  if (!memberId) return badRequest("member_id is required");

  const db = await getSeededDb();
  await expireVerifies(db);
  const newest = await collections(db).verifies.findOne(
    { claimed_member_id: memberId, status: "pending" },
    { ...clean, sort: { created_at: -1 } },
  );
  return json(newest ?? null);
}
