export type ReportProvider = "google-analytics" | "google-search-console" | "google-adsense";

const upstreamKinds = new Set([
  "reconnect-required",
  "rate-limited",
  "upstream",
  "invalid-response",
  "configuration",
]);

export function safeProviderFailure(provider: ReportProvider, error: unknown): {
  provider: ReportProvider;
  kind: string;
} {
  const kind = error && typeof error === "object" && "kind" in error
    ? (error as { kind?: unknown }).kind
    : null;
  return {
    provider,
    kind: typeof kind === "string" && (upstreamKinds.has(kind) || /^invalid-report:[a-z0-9-]{1,80}$/.test(kind) || /^provider-request:adsense-(?:accounts|sites|policy|alerts|report):(?:reconnect-required|rate-limited|upstream|invalid-response|configuration|invalid-report)(?::http-[45]\d\d)?$/.test(kind))
      ? kind
      : "invalid-report",
  };
}

export function logProviderFailure(provider: ReportProvider, error: unknown): void {
  console.error("Google report provider failure", safeProviderFailure(provider, error));
}
