import { uuidV4Schema } from "@omnilede/contracts";

import { requireIdentity } from "../../../../../lib/auth/authorization";
import { jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../../lib/auth/http";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let identity;
  try { identity = await requireIdentity(); } catch { return jsonAuthResponse({ error: "Sign in required" }, 401); }
  const { id } = await context.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonAuthResponse({ error: "Topic not found" }, 404);
  try {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").rpc("claim_topic", { topic_uuid: id, claimant: identity.userId });
    if (error) { if (error.message.includes("active_claim") || error.message.includes("topic_not_available")) return jsonAuthResponse({ error: "That topic is no longer available" }, 409); return unavailableResponse(); }
    return jsonAuthResponse({ ok: true, claimId: data }, 201);
  } catch { return unavailableResponse(); }
}
