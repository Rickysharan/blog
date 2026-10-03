export class ContentRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ContentRequestError(403, "forbidden", "A same-origin request is required.");
  }
}

/** Bound the actual stream, not just the untrusted Content-Length header. */
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new ContentRequestError(415, "invalid_input", "Use application/json.");
  }
  const limit = 256 * 1024;
  const tooLarge = () => new ContentRequestError(413, "invalid_input", "Request exceeds the 256 KiB JSON limit.");
  if (Number(request.headers.get("content-length")) > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new ContentRequestError(400, "invalid_input", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw tooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ContentRequestError(400, "invalid_input", "The JSON body is invalid."); }
}
