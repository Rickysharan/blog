import { cookies } from "next/headers";

import { requireStudioOperator } from "../../../../../lib/auth/operator";
import { sealToken } from "../../../../../lib/crypto/token-vault";
import { parseGoogleOAuthEnv } from "../../../../../lib/env";
import { createAuthorizationRequest, GOOGLE_OAUTH_TRANSACTION_COOKIE } from "../../../../../lib/google/oauth";
import { requireSameOrigin } from "../../../../../lib/http/same-origin";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await requireStudioOperator();
    requireSameOrigin(request);
    const config = parseGoogleOAuthEnv();
    const { authorizationUrl, transaction } = createAuthorizationRequest(config);
    const sealed = sealToken(JSON.stringify(transaction), config.encryptionKey);
    (await cookies()).set(GOOGLE_OAUTH_TRANSACTION_COOKIE, JSON.stringify(sealed), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
      priority: "high"
    });
    return Response.redirect(authorizationUrl, 303);
  } catch {
    return Response.redirect(new URL("/settings/connections?error=start", request.url), 303);
  }
}
