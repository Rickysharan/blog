import { ProviderError } from "./types";

export const PROVIDER_TIMEOUT_MS = 15_000;
export const PROVIDER_RESPONSE_LIMIT = 512 * 1024;

type FetchJsonOptions = RequestInit & { timeoutMs?: number; maxBytes?: number; retry?: boolean };

function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("provider_unauthorized", "disabled", false);
  if (status === 402 || status === 429) return new ProviderError("provider_quota_exhausted", "exhausted", false);
  if (status >= 500) return new ProviderError("provider_upstream_error", "degraded", true);
  return new ProviderError("provider_request_rejected", "degraded", false);
}

async function attempt(url: string, options: FetchJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw errorForStatus(response.status);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > (options.maxBytes ?? PROVIDER_RESPONSE_LIMIT)) throw new ProviderError("provider_response_too_large", "degraded", false);
    try { return JSON.parse(text) as unknown; } catch { throw new ProviderError("provider_malformed_json", "degraded", false); }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new ProviderError("provider_timeout", "degraded", true);
    throw new ProviderError("provider_network_error", "degraded", true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  let last: ProviderError | null = null;
  for (let attemptNumber = 0; attemptNumber < (options.retry === false ? 1 : 2); attemptNumber += 1) {
    try { return await attempt(url, options); }
    catch (error) {
      last = error instanceof ProviderError ? error : new ProviderError("provider_network_error", "degraded", true);
      if (!last.retryable || attemptNumber === 1) throw last;
    }
  }
  throw last ?? new ProviderError("provider_network_error", "degraded", true);
}
