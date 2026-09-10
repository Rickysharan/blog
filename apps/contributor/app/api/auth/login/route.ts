import { createServerSupabaseClient, createServiceSupabaseClient } from "../../../../lib/supabase/server";
import { consumeAuthRateLimit } from "../../../../lib/auth/rate-limit";
import { loginInputSchema, parseAuthInput } from "../../../../lib/auth/input";
import { inputErrorResponse, jsonAuthResponse, rateLimitedResponse, rejectOrigin, unavailableResponse } from "../../../../lib/auth/http";
import { safeNext } from "../../../../lib/auth/safe-next";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;

  let input: { email: string; password: string };
  try {
    input = await parseAuthInput(request, loginInputSchema);
  } catch (error) {
    return inputErrorResponse(error);
  }

  const next = safeNext(new URL(request.url).searchParams.get("next"), request);
  let limit: Awaited<ReturnType<typeof consumeAuthRateLimit>>;
  try {
    limit = await consumeAuthRateLimit(createServiceSupabaseClient(), "auth.login", input.email);
  } catch {
    return unavailableResponse();
  }
  if (limit.unavailable) return unavailableResponse();
  if (!limit.allowed) return rateLimitedResponse();

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) return jsonAuthResponse({ error: "Invalid email or password" }, 401);
    return jsonAuthResponse({ ok: true, next });
  } catch {
    return unavailableResponse();
  }
}
