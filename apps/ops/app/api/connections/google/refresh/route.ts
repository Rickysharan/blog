import { AuthorizationError } from "../../../../../lib/auth/authorization";
import { requireStudioOperator } from "../../../../../lib/auth/operator";
import { listGoogleConnections } from "../../../../../lib/google/connections";
import { refreshGoogleResources } from "../../../../../lib/google/resource-discovery";
import { ContentRequestError, requireSameOrigin } from "../../../../../lib/http/same-origin";

export const dynamic = "force-dynamic";

function privateJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "private, no-store", vary: "Cookie" } });
}

export async function POST(request: Request) {
  try {
    await requireStudioOperator();
    requireSameOrigin(request);
    const results = await refreshGoogleResources();
    return privateJson({ results, connections: await listGoogleConnections() });
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ContentRequestError) {
      return privateJson({ code: "forbidden", message: "Studio operator access required." }, 403);
    }
    return privateJson({ code: "unavailable", message: "Google reports could not be checked. Your editorial work is unchanged." }, 503);
  }
}
