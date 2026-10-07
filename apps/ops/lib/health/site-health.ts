import { isIP } from "node:net";

import type { ProviderState } from "@omnilede/contracts";
import { auditPublicSite, type SiteFinding } from "../../../../lib/seo/audit";

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
          check: "deployment", title: "Deployment status", state: input.deployment.state === "ready" ? "healthy" : input.deployment.state === "failed" ? "critical" : input.deployment.state === "unavailable" ? "unavailable" : "warning",
          evidence: `${input.deployment.detail}${input.deployment.deployId ? ` Deploy ${input.deployment.deployId}.` : ""}`, affectedUrl: input.deployment.url,
          checkedAt: input.checkedAt, severity: input.deployment.state === "ready" ? "ok" : input.deployment.state === "failed" ? "critical" : input.deployment.state === "unavailable" ? "info" : "warning",
          recoveryAction: input.deployment.state === "ready" ? "No action is required; monitor the next deployment." : "Open the current hosting provider's deployment log, resolve the reported failure, and deploy again."
        }
      : unavailable("deployment", "Deployment status", base, input.checkedAt, "Connect a read-only deployment source and refresh health."),
    httpFinding("sitemap", "Sitemap response", input.sitemap, `${base}/sitemap.xml`, input.checkedAt),
    httpFinding("robots", "Robots response", input.robots, `${base}/robots.txt`, input.checkedAt),
    input.publication
      ? { check: "publication", title: "Publication delivery", state: input.publication.state === "healthy" ? "healthy" : "critical", evidence: input.publication.detail, affectedUrl: input.publication.url, checkedAt: input.checkedAt, severity: input.publication.state === "healthy" ? "ok" : "critical", recoveryAction: input.publication.state === "healthy" ? "No action is required; monitor future publications." : "Review the publication receipt and deployment state before retrying any action." }
      : unavailable("publication", "Publication delivery", base, input.checkedAt, "Review publication history and the latest deployment receipt."),
  ];

  if (input.providers?.length) {
    for (const provider of input.providers) {
      const checkedTime = provider.lastCheckedAt ? Date.parse(provider.lastCheckedAt) : Number.NaN;
      const age = Date.parse(input.checkedAt) - checkedTime;
      const missingTime = !Number.isFinite(checkedTime);
      const staleConnected = provider.state === "connected" && !missingTime && age > 24 * 60 * 60 * 1_000;
      const healthy = provider.state === "connected" && !missingTime && !staleConnected;
      const unavailableConnection = provider.state === "disconnected" || missingTime;
      findings.push({
        check: `provider:${provider.provider}`, title: `${provider.provider} connection`, state: healthy ? "healthy" : unavailableConnection ? "unavailable" : "warning",
        evidence: healthy ? `Connected; last checked ${provider.lastCheckedAt}.` : staleConnected ? `Connected evidence is stale; last checked ${provider.lastCheckedAt}.` : `Connection state is ${provider.state}; last checked ${provider.lastCheckedAt ?? "never"}.`,
        affectedUrl: provider.url, checkedAt: input.checkedAt, severity: healthy ? "ok" : unavailableConnection ? "info" : "warning",
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

const MAX_HEALTH_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 2, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0);
  }
  if (isIP(host) === 6) return host === "::1" || host === "::" || host.startsWith("::ffff:") || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("2001:db8:");
  return false;
}

function publicHttpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || isPrivateHostname(url.hostname)) {
    throw new Error("Health checks require a public HTTPS origin without a path.");
  }
  return url.origin;
}

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_HEALTH_RESPONSE_BYTES) throw new Error("Response exceeded the safe size limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_HEALTH_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Response exceeded the safe size limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function fetchApproved(url: string, approvedOrigin: string, fetchImpl: FetchLike, headers?: HeadersInit) {
  let current = new URL(url);
  const signal = AbortSignal.timeout(8_000);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (current.protocol !== "https:" || current.origin !== approvedOrigin || isPrivateHostname(current.hostname)) throw new Error("Blocked an unsafe health-check redirect.");
    const response = await fetchImpl(current.toString(), { method: "GET", cache: "no-store", redirect: "manual", headers, signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("Blocked an invalid health-check redirect chain.");
      current = new URL(location, current);
      continue;
    }
    return { response, text: await boundedText(response), finalUrl: current.toString() };
  }
  throw new Error("Blocked an invalid health-check redirect chain.");
}

async function probe(url: string, fetchImpl: FetchLike): Promise<HttpEvidence> {
  try {
    const { response } = await fetchApproved(url, new URL(url).origin, fetchImpl);
    return { state: response.ok ? "reachable" : "failed", url, status: response.status };
  } catch (error) {
    const reason = error instanceof Error && /(redirect|size limit)/i.test(error.message) ? ` ${error.message}` : "";
    return { state: "failed", url, detail: `The request to ${url} could not be completed.${reason}` };
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
    const { response, text } = await fetchApproved(endpoint, "https://api.netlify.com", fetchImpl, { authorization: `Bearer ${config.token}`, accept: "application/json" });
    if (!response.ok) return { state: "unavailable", url: publicUrl, detail: `Netlify returned HTTP ${response.status} for the latest deploy check.` };
    const payload: unknown = JSON.parse(text);
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
  } catch (error) {
    const reason = error instanceof Error && /(redirect|size limit|large)/i.test(error.message) ? ` ${error.message}` : "";
    return { state: "unavailable", url: publicUrl, detail: `The latest Netlify deployment check could not be completed.${reason}` };
  }
}

export async function collectSiteHealth(options: {
  fetchImpl?: FetchLike;
  auditImpl?: (origin: string) => Promise<SiteFinding[]>;
  now?: Date;
  publicUrl?: string;
  studioUrl?: string;
  netlify?: { siteId: string; token: string };
} = {}): Promise<SiteHealthFinding[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const publicUrl = publicHttpsOrigin(options.publicUrl ?? process.env.NEXT_PUBLIC_BLOG_URL ?? "https://omnilede-news.netlify.app");
  const studioUrl = publicHttpsOrigin(options.studioUrl ?? process.env.NEXT_PUBLIC_STUDIO_URL ?? publicUrl);
  const configuredNetlify = options.netlify ?? (
    process.env.BLOG_NETLIFY_SITE_ID && process.env.NETLIFY_READ_TOKEN
      ? { siteId: process.env.BLOG_NETLIFY_SITE_ID, token: process.env.NETLIFY_READ_TOKEN }
      : undefined
  );
  const auditImpl = options.auditImpl ?? ((origin: string) => auditPublicSite(origin, options.fetchImpl ? { fetchImpl } : {}));
  const [publicOrigin, sitemap, robots, connections, siteFindings] = await Promise.all([
    probe(publicUrl, fetchImpl),
    probe(`${publicUrl}/sitemap.xml`, fetchImpl),
    probe(`${publicUrl}/robots.txt`, fetchImpl),
    listProviderConnections(),
    auditImpl(publicUrl).catch(() => [] as SiteFinding[]),
  ]);
  const deployment: SiteHealthInput["deployment"] = new URL(publicUrl).hostname.endsWith(".vercel.app")
    ? {
        state: publicOrigin.state === "reachable" ? "ready" : "failed",
        url: publicUrl,
        detail: publicOrigin.state === "reachable"
          ? `The active Vercel deployment is serving HTTP ${publicOrigin.status ?? 200}.`
          : "The active Vercel deployment is not serving the public site.",
      }
    : await latestNetlifyDeployment(configuredNetlify, publicUrl, fetchImpl);
  const structuredFinding = siteFindings.find(({ check }) => check === "structured-data");
  const internalLinkFinding = siteFindings.find(({ check }) => check === "internal-links");
  return assessSiteHealth({
    checkedAt: (options.now ?? new Date()).toISOString(),
    publicUrl,
    publicOrigin,
    deployment,
    sitemap,
    robots,
    providers: connections.map((connection) => ({ ...connection, url: `${studioUrl}/${connection.provider === "google-analytics" ? "growth" : connection.provider === "google-search-console" ? "search" : "revenue"}` })),
    structuredData: structuredFinding
      ? {
          state: structuredFinding.state === "pass" ? "valid" : "invalid",
          url: structuredFinding.affectedUrl,
          detail: structuredFinding.evidence,
        }
      : undefined,
    internalLinks: internalLinkFinding
      ? {
          state: internalLinkFinding.state === "pass" ? "valid" : "broken",
          url: internalLinkFinding.affectedUrl,
          detail: internalLinkFinding.evidence,
        }
      : undefined,
  });
}
