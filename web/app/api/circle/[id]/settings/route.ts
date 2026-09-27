import { loadCircle, publicSettings } from "@/lib/server/circle";
import { collections } from "@/lib/server/collections";
import { badRequest, json, newId, notFound, readBody } from "@/lib/server/http";
import { getSeededDb } from "@/lib/server/seed";
import type { CircleMember, CircleRules } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getSeededDb();
  const circle = await loadCircle(db, id);
  if (!circle) return notFound("Unknown circle");
  return json(publicSettings(circle));
}

// New people added from the Circle screen arrive without an id; give them one.
function cleanMember(input: Partial<CircleMember>, index: number): CircleMember | null {
  if (!input.name?.trim()) return null;
  return {
    id: input.id || newId("u"),
    name: input.name.trim(),
    relation: (input.relation ?? "family").trim(),
    phone: (input.phone ?? "").trim(),
    email: (input.email ?? "").trim(),
    priority: Number(input.priority) || index + 1,
    notify_via: Array.isArray(input.notify_via) ? input.notify_via : ["app"],
    can_verify: Boolean(input.can_verify),
  };
}

// Body: { members?, rules? }. The safe word is set only via /safe-word.
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<{ members?: Partial<CircleMember>[]; rules?: Partial<CircleRules> }>(request);
  if (!body) return badRequest("JSON body required");

  const db = await getSeededDb();
  const circle = await loadCircle(db, id);
  if (!circle) return notFound("Unknown circle");

  const update: { members?: CircleMember[]; rules?: CircleRules } = {};
  if (Array.isArray(body.members)) {
    const members = body.members.map(cleanMember);
    if (members.some((member) => member === null)) return badRequest("Every member needs a name");
    update.members = members as CircleMember[];
  }
  if (body.rules) update.rules = { ...circle.rules, ...body.rules };

  await collections(db).circles.updateOne({ id }, { $set: update });
  return json(publicSettings({ ...circle, ...update }));
}
