import { createServerSupabaseClient } from "../../../../lib/supabase/server";
import { jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../lib/auth/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  try {
    const { error } = await (await createServerSupabaseClient()).auth.signOut();
    if (error) return unavailableResponse();
    return jsonAuthResponse({ ok: true });
  } catch {
    return unavailableResponse();
  }
}
