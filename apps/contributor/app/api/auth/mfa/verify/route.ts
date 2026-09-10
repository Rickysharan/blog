import { createServerSupabaseClient } from "../../../../../lib/supabase/server";
import { parseAuthInput, AuthInputError } from "../../../../../lib/auth/input";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../../lib/auth/http";
import { z } from "zod";

const mfaVerifySchema = z.object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let input: { factorId: string; code: string };
  try {
    input = await parseAuthInput(request, mfaVerifySchema);
  } catch (error) {
    return inputErrorResponse(error instanceof AuthInputError ? error : new AuthInputError("Invalid MFA input"));
  }
  try {
    const supabase = await createServerSupabaseClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId: input.factorId });
    if (challenge.error || !challenge.data) return jsonAuthResponse({ error: "Unable to verify authenticator code" }, 400);
    const result = await supabase.auth.mfa.verify({ factorId: input.factorId, challengeId: challenge.data.id, code: input.code });
    if (result.error) return jsonAuthResponse({ error: "Unable to verify authenticator code" }, 400);
    return jsonAuthResponse({ ok: true });
  } catch {
    return unavailableResponse();
  }
}
