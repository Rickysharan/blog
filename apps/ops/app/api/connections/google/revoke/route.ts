import { AuthorizationError } from "../../../../../lib/auth/authorization";
import { requireStudioOperator } from "../../../../../lib/auth/operator";
import { parseGoogleOAuthEnv } from "../../../../../lib/env";
import { revokeGoogleCredentials } from "../../../../../lib/google/connections";
import { ContentRequestError, requireSameOrigin } from "../../../../../lib/http/same-origin";

export const dynamic = "force-dynamic";

function privateJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "private, no-store", vary: "Cookie" } });
}

export async function POST(request: Request) {
  try {
    await requireStudioOperator();
    requireSameOrigin(request);
    const result = await revokeGoogleCredentials(parseGoogleOAuthEnv().encryptionKey);
    return result === "disconnected"
      ? privateJson({ state: "disconnected" })
      : privateJson({ state: "unavailable", reconnectRequired: true, message: "Google could not confirm revocation. Reconnect is required; your editorial work is unchanged." }, 502);
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ContentRequestError) {
      return privateJson({ code: "forbidden", message: "Studio operator access required." }, 403);
    }
    return privateJson({ state: "unavailable", reconnectRequired: true, message: "Google connection could not be changed. Your editorial work is unchanged." }, 503);
  }
}
