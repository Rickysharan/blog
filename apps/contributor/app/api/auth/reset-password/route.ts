import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { resetPasswordInputSchema, parseAuthInput } from "../../../../lib/auth/input";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../lib/auth/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let input: { password: string };
  try {
    input = await parseAuthInput(request, resetPasswordInputSchema);
  } catch (error) {
    return inputErrorResponse(error);
  }
  try {
    const { error } = await (await createServerSupabaseClient()).auth.updateUser({ password: input.password });
    if (error) return jsonAuthResponse({ error: "That reset link is invalid or has expired" }, 400);
    return jsonAuthResponse({ ok: true });
  } catch {
    return unavailableResponse();
  }
}
