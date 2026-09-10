import { createServerSupabaseClient, createServiceSupabaseClient } from "../../../../lib/supabase/server";
import { consumeAuthRateLimit } from "../../../../lib/auth/rate-limit";
import { signupInputSchema, parseAuthInput } from "../../../../lib/auth/input";
import { inputErrorResponse, jsonAuthResponse, rateLimitedResponse, rejectOrigin, unavailableResponse } from "../../../../lib/auth/http";
import { safeNext } from "../../../../lib/auth/safe-next";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;

  let input: { email: string; password: string };
  try {
    input = await parseAuthInput(request, signupInputSchema);
  } catch (error) {
    return inputErrorResponse(error);
  }

  const next = safeNext(new URL(request.url).searchParams.get("next"), request);
  let limit: Awaited<ReturnType<typeof consumeAuthRateLimit>>;
  try {
    limit = await consumeAuthRateLimit(createServiceSupabaseClient(), "auth.signup", input.email);
  } catch {
    return unavailableResponse();
  }
  if (limit.unavailable) return unavailableResponse();
  if (!limit.allowed) return rateLimitedResponse();

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: `${new URL("/auth/callback", request.url).toString()}?next=${encodeURIComponent(next)}` }
    });
    if (error) return jsonAuthResponse({ error: "Unable to create an account" }, 400);
    return jsonAuthResponse({ ok: true, needsConfirmation: !data.session, next });
  } catch {
    return unavailableResponse();
  }
}
