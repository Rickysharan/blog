import {
  createContactDependencies,
  hashContactIdentity,
  processContactPayload,
} from "@/lib/contact/service";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function requestIdentity(request: Request): string {
  const netlifyIp = request.headers.get("x-nf-client-connection-ip")?.trim();
  if (netlifyIp) return netlifyIp;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json(
      { ok: false, code: "unsupported_media_type", message: "Send the form as JSON." },
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(
      { ok: false, code: "request_too_large", message: "The enquiry is too large." },
      413,
    );
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json(
        { ok: false, code: "request_too_large", message: "The enquiry is too large." },
        413,
      );
    }
    payload = JSON.parse(raw) as unknown;
  } catch {
    return json(
      { ok: false, code: "invalid_json", message: "The enquiry could not be read." },
      400,
    );
  }

  try {
    const identityHash = hashContactIdentity(
      requestIdentity(request),
      process.env.CONTACT_RATE_LIMIT_SECRET ?? "",
    );
    const result = await processContactPayload(
      payload,
      { identityHash },
      createContactDependencies(process.env),
    );
    return json(result.body, result.status);
  } catch {
    return json(
      {
        ok: false,
        code: "service_unavailable",
        message: "The secure contact service is not configured. Please retry later.",
      },
      503,
    );
  }
}

function methodNotAllowed(): Response {
  return json({ ok: false, code: "method_not_allowed", message: "Method not allowed." }, 405);
}

export function GET(): Response { return methodNotAllowed(); }
export function PUT(): Response { return methodNotAllowed(); }
export function PATCH(): Response { return methodNotAllowed(); }
export function DELETE(): Response { return methodNotAllowed(); }
