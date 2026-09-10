import { timingSafeEqual } from "node:crypto";

import { jsonAuthResponse } from "../../../../lib/auth/http";

export const dynamic = "force-dynamic";

function validSecret(value: string | null): boolean {
  const expected = process.env.REVIEW_CRON_SECRET ?? "";
  if (!value || !expected || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null)) return jsonAuthResponse({ error: "Unauthorized" }, 401);
  return jsonAuthResponse({ ok: true, queued: 0, maxItems: 10, maxRuntimeMs: 15_000 });
}
