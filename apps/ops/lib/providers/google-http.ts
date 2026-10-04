import "server-only";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ALLOWED_API_ORIGINS = new Set([
  "https://analyticsdata.googleapis.com",
  "https://searchconsole.googleapis.com",
  "https://www.googleapis.com",
  "https://oauth2.googleapis.com",
]);
const MAX_BODY_BYTES = 1_000_000;

export class GoogleProviderError extends Error {
  constructor(
    public readonly kind: "reconnect-required" | "rate-limited" | "upstream" | "invalid-response" | "configuration",
    message = "Google report is temporarily unavailable",
  ) { super(message); }
}

export type GoogleHttpOptions = {
  clientId: string;
  clientSecret: string;
  readRefreshToken: () => Promise<string>;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new GoogleProviderError("invalid-response");
  if (!response.body) throw new GoogleProviderError("invalid-response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new GoogleProviderError("invalid-response"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed;
  } catch { throw new GoogleProviderError("invalid-response"); }
}

function checkedUrl(value: string): URL {
  const url = new URL(value);
  if (!ALLOWED_API_ORIGINS.has(url.origin) || url.username || url.password || url.protocol !== "https:") {
    throw new GoogleProviderError("configuration", "Google API origin is not allowed");
  }
  return url;
}

export function createGoogleHttpClient(options: GoogleHttpOptions) {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 250), 30_000);

  async function refresh(): Promise<string> {
    let refreshToken: string;
    try { refreshToken = await options.readRefreshToken(); }
    catch { throw new GoogleProviderError("reconnect-required"); }
    let response: Response;
    try {
      response = await fetcher(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: options.clientId, client_secret: options.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new GoogleProviderError("upstream"); }
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) throw new GoogleProviderError("reconnect-required");
      if (response.status === 429) throw new GoogleProviderError("rate-limited");
      throw new GoogleProviderError("upstream");
    }
    const body = await readBoundedJson(response) as Record<string, unknown>;
    if (typeof body.access_token !== "string" || body.access_token.length < 1 || body.access_token.length > 8192) {
      throw new GoogleProviderError("invalid-response");
    }
    return body.access_token;
  }

  return async function googleJson(urlValue: string, init: RequestInit = {}): Promise<unknown> {
    const url = checkedUrl(urlValue);
    let accessToken = await refresh();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetcher(url, {
          ...init,
          headers: { accept: "application/json", ...init.headers, authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch { throw new GoogleProviderError("upstream"); }
      if (response.status === 401 && attempt === 0) { accessToken = await refresh(); continue; }
      if (response.status === 401 || response.status === 403) throw new GoogleProviderError("reconnect-required");
      if (response.status === 429) throw new GoogleProviderError("rate-limited");
      if (response.status >= 500) throw new GoogleProviderError("upstream");
      if (!response.ok) throw new GoogleProviderError("invalid-response");
      return readBoundedJson(response);
    }
    throw new GoogleProviderError("reconnect-required");
  };
}
