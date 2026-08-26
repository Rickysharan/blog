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

async function readBoundedText(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
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
      if (byteLength > MAX_JSON_BYTES) {
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

export async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new RequestGuardError(
      "Content-Type must be application/json",
      415,
      "unsupported_media_type",
    );
  }

  const body = await readBoundedText(request);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestGuardError("Request body is not valid JSON", 400, "invalid_json");
  }
}
