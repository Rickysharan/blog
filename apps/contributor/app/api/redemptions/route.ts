import { z } from "zod";

import { requireIdentity } from "../../../lib/auth/authorization";
import { jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../lib/auth/http";
import { parseInput } from "../../../lib/auth/input";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";

const redemptionSchema = z.object({ points: z.number().positive().max(1_000_000) }).strict();

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let identity;
  try { identity = await requireIdentity(); } catch { return jsonAuthResponse({ error: "Sign in required" }, 401); }
  if (process.env.REDEMPTIONS_ENABLED !== "true" || process.env.ALLOW_FUNDED_REDEMPTIONS !== "true") return jsonAuthResponse({ error: "Redemptions are disabled during the $0 launch" }, 403);
  let input: z.infer<typeof redemptionSchema>;
  try { input = await parseInput(request, redemptionSchema, "Invalid redemption input"); } catch (error) { return jsonAuthResponse({ error: error instanceof Error ? error.message : "Invalid redemption input" }, 400); }
  try {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").rpc("request_redemption", { wallet_user: identity.userId, points: input.points });
    if (error) return jsonAuthResponse({ error: "Redemptions are disabled during the $0 launch" }, 403);
    return jsonAuthResponse({ ok: true, redemptionId: data }, 201);
  } catch { return unavailableResponse(); }
}
