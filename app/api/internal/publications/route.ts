import { jsonPublicationResponse, receivePublicationRequest } from "@/lib/publishing/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return receivePublicationRequest(request);
}

function methodNotAllowed(): Response {
  return jsonPublicationResponse({ code: "method_not_allowed", message: "Method not allowed" }, 405);
}

export function GET(): Response { return methodNotAllowed(); }
export function PUT(): Response { return methodNotAllowed(); }
export function PATCH(): Response { return methodNotAllowed(); }
export function DELETE(): Response { return methodNotAllowed(); }
export function OPTIONS(): Response { return methodNotAllowed(); }
