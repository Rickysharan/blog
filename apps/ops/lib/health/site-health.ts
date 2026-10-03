import type { ProviderState } from "@omnilede/contracts";

import { listProviderConnections } from "../tasks/repository";

export type HealthState = "healthy" | "warning" | "critical" | "unavailable";
export type HealthSeverity = "ok" | "info" | "warning" | "critical";
export type SiteHealthFinding = {
  check: string;
  title: string;
  state: HealthState;
  evidence: string;
  affectedUrl: string;
  checkedAt: string;
  severity: HealthSeverity;
  recoveryAction: string;
};

type HttpEvidence = { state: "reachable" | "failed"; url: string; status?: number; detail?: string };
type ValidationEvidence = { state: "valid" | "invalid"; url: string; detail: string };

export interface SiteHealthInput {
  checkedAt: string;
  publicUrl?: string;
  publicOrigin?: HttpEvidence;
  deployment?: { state: "ready" | "building" | "failed" | "unavailable"; url: string; deployId?: string; detail: string };
  sitemap?: HttpEvidence;
  robots?: HttpEvidence;
  publication?: { state: "healthy" | "failed"; url: string; detail: string };
  providers?: Array<{ provider: string; state: ProviderState; url: string; lastCheckedAt: string | null }>;
  structuredData?: ValidationEvidence;
  internalLinks?: { state: "valid" | "broken"; url: string; detail: string };
}

function unavailable(check: string, title: string, url: string, checkedAt: string, recoveryAction: string): SiteHealthFinding {
  return { check, title, state: "unavailable", evidence: "Evidence is unavailable because this check has not run or its source is not connected.", affectedUrl: url, checkedAt, severity: "info", recoveryAction };
}

function httpFinding(check: string, title: string, value: HttpEvidence | undefined, fallbackUrl: string, checkedAt: string): SiteHealthFinding {
  if (!value) return unavailable(check, title, fallbackUrl, checkedAt, `Run the ${title.toLowerCase()} check again.`);
  const evidence = value.detail ?? (value.status ? `HTTP ${value.status} returned for ${value.url}.` : `The request to ${value.url} failed.`);
  return value.state === "reachable"
    ? { check, title, state: "healthy", evidence, affectedUrl: value.url, checkedAt, severity: "ok", recoveryAction: "No action is required; continue scheduled checks." }
    : { check, title, state: "critical", evidence, affectedUrl: value.url, checkedAt, severity: "critical", recoveryAction: `Restore a successful response for ${value.url}, then rerun the check.` };
}

export function assessSiteHealth(input: SiteHealthInput): SiteHealthFinding[] {
  const base = input.publicUrl ?? input.publicOrigin?.url ?? "https://omnilede-news.netlify.app";
  const findings: SiteHealthFinding[] = [
    httpFinding("public-origin", "Public site reachability", input.publicOrigin, base, input.checkedAt),
    input.deployment
      ? {
          check: "deployment", title: "Latest deployment", state: input.deployment.state === "ready" ? "healthy" : input.deployment.state === "failed" ? "critical" : input.deployment.state === "unavailable" ? "unavailable" : "warning",
          evidence: `${input.deployment.detail}${input.deployment.deployId ? ` Deploy ${input.deployment.deployId}.` : ""}`, affectedUrl: input.deployment.url,
          checkedAt: input.checkedAt, severity: input.deployment.state === "ready" ? "ok" : input.deployment.state === "failed" ? "critical" : input.deployment.state === "unavailable" ? "info" : "warning",
          recoveryAction: input.deployment.state === "ready" ? "No action is required; monitor the next deployment." : "Open the latest Netlify deploy log, resolve the reported failure, and deploy again."
        }
      : unavailable("deployment", "Latest deployment", base, input.checkedAt, "Connect the read-only Netlify deployment source and refresh health."),
    httpFinding("sitemap", "Sitemap response", input.sitemap, `${base}/sitemap.xml`, input.checkedAt),
    httpFinding("robots", "Robots response", input.robots, `${base}/robots.txt`, input.checkedAt),
    input.publication
      ? { check: "publication", title: "Publication delivery", state: input.publication.state === "healthy" ? "healthy" : "critical", evidence: input.publication.detail, affectedUrl: input.publication.url, checkedAt: input.checkedAt, severity: input.publication.state === "healthy" ? "ok" : "critical", recoveryAction: input.publication.state === "healthy" ? "No action is required; monitor future publications." : "Review the publication receipt and deployment state before retrying any action." }
      : unavailable("publication", "Publication delivery", base, input.checkedAt, "Review publication history and the latest deployment receipt."),
  ];

  if (input.providers?.length) {
    for (const provider of input.providers) {
      const healthy = provider.state === "connected";
      findings.push({
        check: `provider:${provider.provider}`, title: `${provider.provider} connection`, state: healthy ? "healthy" : provider.state === "disconnected" ? "unavailable" : "warning",
        evidence: healthy ? `Connected; last checked ${provider.lastCheckedAt ?? "at an unavailable time"}.` : `Connection state is ${provider.state}; last checked ${provider.lastCheckedAt ?? "never"}.`,
        affectedUrl: provider.url, checkedAt: input.checkedAt, severity: healthy ? "ok" : provider.state === "disconnected" ? "info" : "warning",
        recoveryAction: healthy ? "No action is required; continue scheduled refreshes." : "Reconnect the provider or inspect its last refresh error."
      });
    }
  } else {
    findings.push(unavailable("provider-connections", "Provider connections", `${base}/growth`, input.checkedAt, "Connect providers from Studio before relying on their reports."));
  }

  findings.push(input.structuredData
    ? { check: "structured-data", title: "Structured data", state: input.structuredData.state === "valid" ? "healthy" : "warning", evidence: input.structuredData.detail, affectedUrl: input.structuredData.url, checkedAt: input.checkedAt, severity: input.structuredData.state === "valid" ? "ok" : "warning", recoveryAction: input.structuredData.state === "valid" ? "No action is required; validate after template changes." : "Correct the reported structured-data field and validate the page again." }
    : unavailable("structured-data", "Structured data", base, input.checkedAt, "Run structured-data validation against public article pages."));
  findings.push(input.internalLinks
    ? { check: "internal-links", title: "Internal links", state: input.internalLinks.state === "valid" ? "healthy" : "warning", evidence: input.internalLinks.detail, affectedUrl: input.internalLinks.url, checkedAt: input.checkedAt, severity: input.internalLinks.state === "valid" ? "ok" : "warning", recoveryAction: input.internalLinks.state === "valid" ? "No action is required; scan after content changes." : "Repair or remove the broken internal links, then run the scan again." }
    : unavailable("internal-links", "Internal links", base, input.checkedAt, "Run the internal-link scan against the deployed site."));
  return findings;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function probe(url: string, fetchImpl: FetchLike): Promise<HttpEvidence> {
  try {
    const response = await fetchImpl(url, { method: "GET", cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(8_000) });
    return { state: response.ok ? "reachable" : "failed", url, status: response.status };
  } catch {
    return { state: "failed", url, detail: `The request to ${url} could not be completed.` };
  }
}

async function latestNetlifyDeployment(
  config: { siteId: string; token: string } | undefined,
  publicUrl: string,
  fetchImpl: FetchLike,
): Promise<SiteHealthInput["deployment"]> {
  if (!config) return undefined;
  try {
    const endpoint = `https://api.netlify.com/api/v1/sites/${encodeURIComponent(config.siteId)}/deploys?per_page=1`;
    const response = await fetchImpl(endpoint, {
      method: "GET",
      cache: "no-store",
      headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { state: "unavailable", url: publicUrl, detail: `Netlify returned HTTP ${response.status} for the latest deploy check.` };
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length === 0 || !payload[0] || typeof payload[0] !== "object") {
      return { state: "unavailable", url: publicUrl, detail: "Netlify did not return a latest deployment." };
    }
    const row = payload[0] as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : undefined;
    const rawState = typeof row.state === "string" ? row.state : "unavailable";
    const state = rawState === "ready"
      ? "ready"
      : rawState === "error"
        ? "failed"
        : ["new", "pending_review", "accepted", "enqueued", "building", "uploading", "uploaded", "preparing", "prepared", "processing", "processed", "retrying"].includes(rawState)
          ? "building"
          : "unavailable";
    return { state, url: publicUrl, deployId: id, detail: `Latest Netlify deploy state is ${rawState}.` };
  } catch {
    return { state: "unavailable", url: publicUrl, detail: "The latest Netlify deployment check could not be completed." };
  }
}

export async function collectSiteHealth(options: {
  fetchImpl?: FetchLike;
  now?: Date;
  publicUrl?: string;
  studioUrl?: string;
  netlify?: { siteId: string; token: string };
} = {}): Promise<SiteHealthFinding[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const publicUrl = new URL(options.publicUrl ?? process.env.NEXT_PUBLIC_BLOG_URL ?? "https://omnilede-news.netlify.app").origin;
  const studioUrl = new URL(options.studioUrl ?? process.env.NEXT_PUBLIC_STUDIO_URL ?? publicUrl).origin;
  const configuredNetlify = options.netlify ?? (
    process.env.BLOG_NETLIFY_SITE_ID && process.env.NETLIFY_READ_TOKEN
      ? { siteId: process.env.BLOG_NETLIFY_SITE_ID, token: process.env.NETLIFY_READ_TOKEN }
      : undefined
  );
  const [publicOrigin, sitemap, robots, deployment, connections] = await Promise.all([
    probe(publicUrl, fetchImpl),
    probe(`${publicUrl}/sitemap.xml`, fetchImpl),
    probe(`${publicUrl}/robots.txt`, fetchImpl),
    latestNetlifyDeployment(configuredNetlify, publicUrl, fetchImpl),
    listProviderConnections(),
  ]);
  return assessSiteHealth({
    checkedAt: (options.now ?? new Date()).toISOString(),
    publicUrl,
    publicOrigin,
    deployment,
    sitemap,
    robots,
    providers: connections.map((connection) => ({ ...connection, url: `${studioUrl}/${connection.provider === "google-analytics" ? "growth" : connection.provider === "google-search-console" ? "search" : "revenue"}` })),
  });
}
