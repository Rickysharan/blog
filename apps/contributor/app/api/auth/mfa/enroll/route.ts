import { createServerSupabaseClient } from "../../../../../lib/supabase/server";
import { jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../../lib/auth/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "OmniLede authenticator" });
    if (error || !data) return jsonAuthResponse({ error: "Unable to start multi-factor setup" }, 400);
    return jsonAuthResponse({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  } catch {
    return unavailableResponse();
  }
}
