// CORS headers for every /api route are added in next.config.ts.

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function badRequest(message: string) {
  return json({ ok: false, error: message }, 400);
}

export function notFound(message = "Not found") {
  return json({ ok: false, error: message }, 404);
}

export async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// "+1 (404) 555-0111" and "4045550111" both become "4045550111".
export function phoneKey(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}
