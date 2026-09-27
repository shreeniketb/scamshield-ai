import type { NextRequest } from "next/server";
import { loadCircle } from "@/lib/server/circle";
import { json, notFound } from "@/lib/server/http";
import { listReports } from "@/lib/server/reports";
import { CIRCLE_ID, getSeededDb } from "@/lib/server/seed";

// Activity feed: final call reports plus live calls/messages still in progress.
export async function GET(request: NextRequest) {
  const circleId = request.nextUrl.searchParams.get("circle_id") ?? CIRCLE_ID;
  const db = await getSeededDb();
  const circle = await loadCircle(db, circleId);
  if (!circle) return notFound("Unknown circle");
  return json(await listReports(db, circle));
}
