import { createServerSupabaseClient, createServiceSupabaseClient } from "../../../../lib/supabase/server";
import { consumeAuthRateLimit } from "../../../../lib/auth/rate-limit";
import { forgotPasswordInputSchema, parseAuthInput } from "../../../../lib/auth/input";
import { inputErrorResponse, jsonAuthResponse, rateLimitedResponse, rejectOrigin, unavailableResponse } from "../../../../lib/auth/http";

const GENERIC_MESSAGE = "If an account exists for that email, a reset link will be sent shortly.";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;

  let input: { email: string };
  try {
    input = await parseAuthInput(request, forgotPasswordInputSchema);
  } catch (error) {
    return inputErrorResponse(error);
  }

  let limit: Awaited<ReturnType<typeof consumeAuthRateLimit>>;
  try {
    limit = await consumeAuthRateLimit(createServiceSupabaseClient(), "auth.forgot-password", input.email);
  } catch {
    return unavailableResponse();
  }
  if (limit.unavailable) return unavailableResponse();
  if (!limit.allowed) return rateLimitedResponse();

  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${new URL("/auth/callback", request.url).toString()}?next=${encodeURIComponent("/reset-password")}`
    });
  } catch {
    // Keep reset requests indistinguishable even when the provider is unavailable.
  }
  return jsonAuthResponse({ ok: true, message: GENERIC_MESSAGE });
}
