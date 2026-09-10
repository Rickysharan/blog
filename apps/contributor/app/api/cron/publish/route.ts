import { timingSafeEqual } from "node:crypto";

import { jsonAuthResponse } from "../../../../lib/auth/http";
import { runPublicationBatch } from "../../../../lib/publication/outbox";

export const dynamic = "force-dynamic";

function hasValidBearer(request: Request): boolean {
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const expected = process.env.PUBLICATION_CRON_SECRET ?? "";
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    expectedBytes.byteLength >= 32 &&
    suppliedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!hasValidBearer(request)) return jsonAuthResponse({ error: "Unauthorized" }, 401);
  try {
    return jsonAuthResponse({ ok: true, ...(await runPublicationBatch({ maxItems: 5, maxRuntimeMs: 20_000 })) });
  } catch {
    return jsonAuthResponse({ error: "Publication worker unavailable" }, 503);
  }
}
