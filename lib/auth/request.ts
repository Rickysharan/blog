import { readAdminSession, type AdminSession } from "@/lib/auth/session";

const MAX_JSON_BYTES = 32 * 1024;

export class RequestGuardError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RequestGuardError";
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new RequestGuardError("Origin header is required", 403, "invalid_origin");
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    const suppliedOrigin = new URL(origin).origin;
    if (suppliedOrigin !== requestOrigin || suppliedOrigin !== origin) {
      throw new Error("Origin mismatch");
    }
  } catch {
    throw new RequestGuardError("Request origin is not allowed", 403, "invalid_origin");
  }
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestGuardError("Request body is too large", 413, "body_too_large");
  }
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel("Request body is too large");
        throw new RequestGuardError(
          "Request body is too large",
          413,
          "body_too_large",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readBoundedJson(
  request: Request,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new RequestGuardError(
      "Content-Type must be application/json",
      415,
      "unsupported_media_type",
    );
  }

  const maxBytes = options.maxBytes ?? MAX_JSON_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 1024 * 1024) {
    throw new RequestGuardError("Request size limit is invalid", 500, "invalid_limit");
  }
  const body = await readBoundedText(request, maxBytes);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestGuardError("Request body is not valid JSON", 400, "invalid_json");
  }
}

export async function requireAdminSession(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): Promise<AdminSession> {
  const secret = env.ADMIN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new RequestGuardError(
      "Admin authentication is unavailable",
      503,
      "auth_unavailable",
    );
  }
  const session = await readAdminSession(request, secret);
  if (!session) {
    throw new RequestGuardError("Authentication is required", 401, "unauthorized");
  }
  return session;
}
