import type { NextRequest } from "next/server";
import { clean } from "@/lib/db";
import { collections } from "@/lib/server/collections";
import { json } from "@/lib/server/http";
import { CIRCLE_ID, getSeededDb } from "@/lib/server/seed";

export async function GET(request: NextRequest) {
  const circleId = request.nextUrl.searchParams.get("circle_id") ?? CIRCLE_ID;
  const db = await getSeededDb();
  const alerts = await collections(db)
    .alerts.find({ circle_id: circleId }, clean)
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  return json(alerts);
}
