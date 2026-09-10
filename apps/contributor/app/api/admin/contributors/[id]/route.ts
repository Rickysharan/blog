import { uuidV4Schema } from "@omnilede/contracts";
import { z } from "zod";

import { requireAdmin } from "../../../../../lib/auth/authorization";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../../lib/auth/http";
import { parseInput } from "../../../../../lib/auth/input";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/server";

const statusInputSchema = z.object({ expectedVersion: z.number().int().positive().safe(), nextStatus: z.enum(["active", "suspended", "banned"]), reason: z.string().trim().min(10).max(2_000) }).strict();

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let identity;
  try { identity = await requireAdmin(); } catch { return jsonAuthResponse({ error: "Administrator access required" }, 403); }
  const { id } = await context.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonAuthResponse({ error: "Contributor not found" }, 404);
  let input: z.infer<typeof statusInputSchema>;
  try { input = await parseInput(request, statusInputSchema, "Invalid account status input"); } catch (error) { return inputErrorResponse(error); }
  try {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").rpc("set_account_status", { p_user_id: id, p_expected_version: input.expectedVersion, p_next_status: input.nextStatus, p_actor_type: "admin", p_actor_id: identity.userId, p_reason: input.reason });
    if (error) { if (error.message.includes("conflict")) return jsonAuthResponse({ error: "Contributor changed; refresh before updating" }, 409); return unavailableResponse(); }
    return jsonAuthResponse({ ok: true, status: data });
  } catch { return unavailableResponse(); }
}
