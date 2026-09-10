import { z } from "zod";

import { createServiceSupabaseClient } from "../../../../lib/supabase/server";
import { jsonAuthResponse } from "../../../../lib/auth/http";
import { verifyPayload } from "../../../../lib/security/hmac";

const reviewBatchSchema = z.object({ submissionIds: z.array(z.string().uuid()).max(10), maxItems: z.number().int().min(1).max(10).optional() }).strict();

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 512 * 1024) return jsonAuthResponse({ error: "Review payload is too large" }, 413);
  if (request.headers.get("x-omnilede-audience") !== "contributor-review") return jsonAuthResponse({ error: "Invalid review audience" }, 401);
  const timestamp = request.headers.get("x-omnilede-timestamp");
  const nonce = request.headers.get("x-omnilede-nonce");
  if (!verifyPayload(process.env.REVIEW_HMAC_SECRET ?? "", request.headers.get("x-omnilede-signature"), timestamp, nonce, body)) return jsonAuthResponse({ error: "Invalid review signature" }, 401);
  let payload: z.infer<typeof reviewBatchSchema>;
  try { payload = reviewBatchSchema.parse(JSON.parse(body)); } catch { return jsonAuthResponse({ error: "Invalid review payload" }, 400); }
  try {
    const replay = await createServiceSupabaseClient().schema("app_private").rpc("consume_review_nonce", { p_nonce: nonce, p_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    if (replay.error || replay.data !== true) return jsonAuthResponse({ error: "Replay detected" }, 409);
  } catch { return jsonAuthResponse({ error: "Review service unavailable" }, 503); }
  const started = Date.now();
  const maxItems = Math.min(payload.maxItems ?? payload.submissionIds.length, 10);
  const processed = payload.submissionIds.slice(0, maxItems).map(() => ({ state: "queued" as const }));
  return jsonAuthResponse({ ok: true, processed: processed.length, elapsedMs: Date.now() - started });
}
