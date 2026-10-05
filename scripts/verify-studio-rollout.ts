import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

export type ProviderTruthState = "connected" | "delayed" | "stale" | "unavailable" | "disconnected";

export interface StudioRolloutEvidence {
  schemaVersion: 1;
  environment: "preview" | "production-candidate";
  checkedAt: string;
  studioOrigin: string;
  auth: { expectedOperator: string; authenticatedOperator: string; callbackUrl: string };
  read: { draftPath: string; version: string; bytesSha256: string };
  save: { priorVersion: string; savedVersion: string; submittedBytesSha256: string; readBackBytesSha256: string };
  publish: {
    repository: string;
    branch: string;
    productionBranch: string;
    articlePath: string;
    reviewedBytesBase64: string;
    publishedBytesBase64: string;
    gitBlobSha: string;
    publicationUrl: string;
  };
  pwa: {
    manifestUrl: string;
    manifestStatus: number;
    serviceWorkerStatus: number;
    display: string;
    installable: boolean;
    privateRoutesNetworkOnly: boolean;
  };
  native: {
    configuredOrigin: string;
    bridgeOrigin: string;
    bridgeAvailable: boolean;
    writerAutoStarted: boolean;
    terminalOpened: boolean;
  };
  deployments: {
    studio: { siteId: string; deployId: string; commitRef: string; deployUrl: string };
    blogPreview: { siteId: string; deployId: string; commitRef: string; deployUrl: string };
  };
  providers: Array<{ provider: string; observed: ProviderTruthState; displayed: ProviderTruthState }>;
  publicAdminPreview: { origin: string; statuses: Record<string, number> };
}

export interface TrustedRolloutConfig {
  studioOrigin: string;
  blogPreviewOrigin: string;
  operatorEmail: string;
  oauthCallbackUrl: string;
  repository: string;
  previewBranch: string;
  productionBranch: string;
  studioSiteId: string;
  studioDeployId: string;
  studioCommitRef: string;
  blogSiteId: string;
  blogDeployId: string;
  blogCommitRef: string;
}

export interface RolloutEvaluation {
  approved: boolean;
  authorizeRetirementPreview: false;
  authorizeProductionRetirement: false;
  failures: string[];
}

export interface SignedRolloutVerdict {
  schemaVersion: 1;
  environment: StudioRolloutEvidence["environment"];
  checkedAt: string;
  evidenceDigest: string;
  trustedConfigDigest: string;
  approved: true;
  authorizeRetirementPreview: boolean;
  authorizeProductionRetirement: boolean;
  liveChecksPassed: true;
  algorithm: "hmac-sha256";
  signature: string;
}

export const OMNILEDE_STUDIO_ORIGIN = "https://omnilede-studio.netlify.app";
export const OMNILEDE_REPOSITORY = "Rickysharan/blog";
export const OMNILEDE_PREVIEW_BRANCH = "studio-preview-content";
export const OMNILEDE_PRODUCTION_BRANCH = "main";
export const OMNILEDE_STUDIO_SITE_ID = "683e76d0-156a-4b65-9b1e-cb091ccfbdec";
export const OMNILEDE_BLOG_SITE_ID = "074fd996-f0b8-4824-b254-a0b4753cf523";

interface RolloutEnvironment {
  STUDIO_ROLLOUT_BLOG_PREVIEW_ORIGIN?: string;
  STUDIO_ROLLOUT_EXPECTED_OPERATOR_EMAIL?: string;
  STUDIO_ROLLOUT_STUDIO_DEPLOY_ID?: string;
  STUDIO_ROLLOUT_STUDIO_COMMIT?: string;
  STUDIO_ROLLOUT_BLOG_DEPLOY_ID?: string;
  STUDIO_ROLLOUT_BLOG_COMMIT?: string;
}

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CONTENT_PATH = /^content\/(?:drafts|articles)\/[a-z0-9-]+\/[a-z0-9-]+\.mdx$/;
const RESERVED_BRANCHES = new Set(["main", "master", "production", "prod"]);
const REQUIRED_PROVIDERS = ["google-analytics", "google-search-console", "google-adsense"] as const;
const PROVIDER_STATES = ["connected", "delayed", "stale", "unavailable", "disconnected"] as const;
const REQUIRED_ADMIN_ROUTES = [
  "/admin/login",
  "/admin/review",
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/drafts",
  "/api/admin/drafts/anime/retirement-probe.mdx",
] as const;
const PRE_RETIREMENT_ADMIN_STATUSES: Record<(typeof REQUIRED_ADMIN_ROUTES)[number], readonly number[]> = {
  "/admin/login": [200],
  "/admin/review": [200, 302, 303, 307, 308],
  "/api/admin/login": [405],
  "/api/admin/logout": [405],
  "/api/admin/drafts": [401, 403],
  "/api/admin/drafts/anime/retirement-probe.mdx": [401, 403],
};
const MAX_LIVE_BODY_BYTES = 1024 * 1024;

function safeHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.origin === value.replace(/\/$/, "") && url.pathname === "/" && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

const httpsOriginSchema = z.string().superRefine((value, context) => {
  if (!safeHttpsOrigin(value)) context.addIssue({ code: "custom", message: "Expected an exact HTTPS origin" });
});

const providerStateSchema = z.enum(PROVIDER_STATES);
const evidenceSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.enum(["preview", "production-candidate"]),
  checkedAt: z.string(),
  studioOrigin: httpsOriginSchema,
  auth: z.object({
    expectedOperator: z.string().trim().email(),
    authenticatedOperator: z.string().trim().email(),
    callbackUrl: z.string().url(),
  }).strict(),
  read: z.object({ draftPath: z.string(), version: z.string(), bytesSha256: z.string() }).strict(),
  save: z.object({
    priorVersion: z.string(), savedVersion: z.string(), submittedBytesSha256: z.string(), readBackBytesSha256: z.string(),
  }).strict(),
  publish: z.object({
    repository: z.string(), branch: z.string(), productionBranch: z.string(), articlePath: z.string(),
    reviewedBytesBase64: z.string(), publishedBytesBase64: z.string(), gitBlobSha: z.string(), publicationUrl: z.string(),
  }).strict(),
  pwa: z.object({
    manifestUrl: z.string(), manifestStatus: z.number().int(), serviceWorkerStatus: z.number().int(), display: z.string(),
    installable: z.boolean(), privateRoutesNetworkOnly: z.boolean(),
  }).strict(),
  native: z.object({
    configuredOrigin: z.string(), bridgeOrigin: z.string(), bridgeAvailable: z.boolean(), writerAutoStarted: z.boolean(), terminalOpened: z.boolean(),
  }).strict(),
  deployments: z.object({
    studio: z.object({ siteId: z.string(), deployId: z.string().min(1), commitRef: z.string(), deployUrl: httpsOriginSchema }).strict(),
    blogPreview: z.object({ siteId: z.string(), deployId: z.string().min(1), commitRef: z.string(), deployUrl: httpsOriginSchema }).strict(),
  }).strict(),
  providers: z.array(z.object({ provider: z.string(), observed: providerStateSchema, displayed: providerStateSchema }).strict()),
  publicAdminPreview: z.object({ origin: httpsOriginSchema, statuses: z.record(z.string(), z.number().int()) }).strict(),
}).strict();

const trustedConfigSchema = z.object({
  studioOrigin: z.literal(OMNILEDE_STUDIO_ORIGIN),
  blogPreviewOrigin: httpsOriginSchema,
  operatorEmail: z.string().trim().email().transform((value) => value.toLowerCase()),
  oauthCallbackUrl: z.literal(`${OMNILEDE_STUDIO_ORIGIN}/api/connections/google/callback`),
  repository: z.literal(OMNILEDE_REPOSITORY),
  previewBranch: z.literal(OMNILEDE_PREVIEW_BRANCH),
  productionBranch: z.literal(OMNILEDE_PRODUCTION_BRANCH),
  studioSiteId: z.literal(OMNILEDE_STUDIO_SITE_ID),
  studioDeployId: z.string().min(1),
  studioCommitRef: z.string().regex(SHA40),
  blogSiteId: z.literal(OMNILEDE_BLOG_SITE_ID),
  blogDeployId: z.string().min(1),
  blogCommitRef: z.string().regex(SHA40),
}).strict();

export function parseTrustedRolloutConfig(
  environment: RolloutEnvironment = process.env as RolloutEnvironment,
): TrustedRolloutConfig {
  return trustedConfigSchema.parse({
    studioOrigin: OMNILEDE_STUDIO_ORIGIN,
    blogPreviewOrigin: environment.STUDIO_ROLLOUT_BLOG_PREVIEW_ORIGIN,
    operatorEmail: environment.STUDIO_ROLLOUT_EXPECTED_OPERATOR_EMAIL,
    oauthCallbackUrl: `${OMNILEDE_STUDIO_ORIGIN}/api/connections/google/callback`,
    repository: OMNILEDE_REPOSITORY,
    previewBranch: OMNILEDE_PREVIEW_BRANCH,
    productionBranch: OMNILEDE_PRODUCTION_BRANCH,
    studioSiteId: OMNILEDE_STUDIO_SITE_ID,
    studioDeployId: environment.STUDIO_ROLLOUT_STUDIO_DEPLOY_ID,
    studioCommitRef: environment.STUDIO_ROLLOUT_STUDIO_COMMIT,
    blogSiteId: OMNILEDE_BLOG_SITE_ID,
    blogDeployId: environment.STUDIO_ROLLOUT_BLOG_DEPLOY_ID,
    blogCommitRef: environment.STUDIO_ROLLOUT_BLOG_COMMIT,
  });
}

export function parseStudioRolloutEvidence(value: unknown): StudioRolloutEvidence {
  return evidenceSchema.parse(value) as StudioRolloutEvidence;
}

function decodeCanonicalBase64(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length > 0 && decoded.toString("base64") === value ? decoded : null;
  } catch {
    return null;
  }
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function gitBlobSha(value: Uint8Array): string {
  const header = Buffer.from(`blob ${value.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(value).digest("hex");
}

function normalizedBranch(value: string): string {
  return value.replace(/^refs\/heads\//, "");
}

function publicationIdentity(evidence: StudioRolloutEvidence, trusted: TrustedRolloutConfig): { commit: string } | null {
  try {
    const url = new URL(evidence.publish.publicationUrl);
    const [owner, repository] = trusted.repository.split("/");
    const prefix = `/${owner}/${repository}/blob/`;
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
    const remainder = url.pathname.slice(prefix.length);
    const separator = remainder.indexOf("/");
    const commit = remainder.slice(0, separator);
    const path = decodeURIComponent(remainder.slice(separator + 1));
    return separator > 0 && SHA40.test(commit) && path === evidence.publish.articlePath ? { commit } : null;
  } catch {
    return null;
  }
}

export function evaluateStudioRollout(rawEvidence: unknown, rawTrusted: TrustedRolloutConfig): RolloutEvaluation {
  const failures: string[] = [];
  const evidenceResult = evidenceSchema.safeParse(rawEvidence);
  const trustedResult = trustedConfigSchema.safeParse(rawTrusted);
  if (!evidenceResult.success) failures.push("Rollout evidence failed runtime validation.");
  if (!trustedResult.success) failures.push("Trusted rollout configuration is invalid.");
  if (!evidenceResult.success || !trustedResult.success) {
    return { approved: false, authorizeRetirementPreview: false, authorizeProductionRetirement: false, failures };
  }
  const evidence = evidenceResult.data as StudioRolloutEvidence;
  const trusted = trustedResult.data as TrustedRolloutConfig;
  if (!Number.isFinite(Date.parse(evidence.checkedAt))) failures.push("Evidence timestamp is invalid.");

  if (evidence.studioOrigin !== trusted.studioOrigin) failures.push("Studio origin does not match trusted deployment configuration.");
  if (
    evidence.auth.expectedOperator.toLowerCase() !== trusted.operatorEmail ||
    evidence.auth.authenticatedOperator.toLowerCase() !== trusted.operatorEmail
  ) failures.push("The authenticated operator does not exactly match trusted configuration.");
  if (evidence.auth.callbackUrl !== trusted.oauthCallbackUrl) failures.push("The OAuth callback does not match trusted configuration.");

  if (!CONTENT_PATH.test(evidence.read.draftPath) || !evidence.read.draftPath.startsWith("content/drafts/")) {
    failures.push("The controlled draft read path is invalid.");
  }
  if (!SHA40.test(evidence.read.version) || !SHA256.test(evidence.read.bytesSha256)) {
    failures.push("The controlled draft read has no immutable version and byte digest.");
  }
  if (
    !SHA40.test(evidence.save.priorVersion) || !SHA40.test(evidence.save.savedVersion) ||
    evidence.save.priorVersion !== evidence.read.version || evidence.save.savedVersion === evidence.save.priorVersion ||
    !SHA256.test(evidence.save.submittedBytesSha256) || evidence.save.submittedBytesSha256 !== evidence.save.readBackBytesSha256
  ) failures.push("The controlled save was not versioned and read back byte-for-byte.");

  const reviewedBytes = decodeCanonicalBase64(evidence.publish.reviewedBytesBase64);
  const publishedBytes = decodeCanonicalBase64(evidence.publish.publishedBytesBase64);
  const exactPublishedBytes = Boolean(reviewedBytes && publishedBytes && reviewedBytes.byteLength === publishedBytes.byteLength && timingSafeEqual(reviewedBytes, publishedBytes));
  const safeBranch = normalizedBranch(evidence.publish.branch);
  const productionBranch = normalizedBranch(evidence.publish.productionBranch);
  if (
    evidence.publish.repository !== trusted.repository || safeBranch !== trusted.previewBranch || productionBranch !== trusted.productionBranch ||
    safeBranch === productionBranch || RESERVED_BRANCHES.has(safeBranch.toLowerCase())
  ) failures.push("Controlled publishing is not bound to the trusted repository and preview branch.");
  if (!REPOSITORY.test(evidence.publish.repository)) failures.push("The controlled publication repository is invalid.");
  if (!CONTENT_PATH.test(evidence.publish.articlePath) || !evidence.publish.articlePath.startsWith("content/articles/")) {
    failures.push("The controlled publication article path is invalid.");
  }
  if (
    !exactPublishedBytes || evidence.publish.gitBlobSha !== gitBlobSha(publishedBytes ?? Buffer.alloc(0)) ||
    sha256(reviewedBytes ?? Buffer.alloc(0)) !== evidence.save.readBackBytesSha256 || !publicationIdentity(evidence, trusted)
  ) failures.push("The controlled publication does not prove exact reviewed bytes and a matching Git blob receipt.");

  if (
    evidence.pwa.manifestUrl !== `${trusted.studioOrigin}/manifest.webmanifest` || evidence.pwa.manifestStatus !== 200 ||
    evidence.pwa.serviceWorkerStatus !== 200 || evidence.pwa.display !== "standalone" || !evidence.pwa.installable ||
    !evidence.pwa.privateRoutesNetworkOnly
  ) failures.push("The Studio PWA is not installable with network-only private routes.");

  if (
    safeHttpsOrigin(evidence.native.configuredOrigin) !== trusted.studioOrigin || safeHttpsOrigin(evidence.native.bridgeOrigin) !== trusted.studioOrigin ||
    !evidence.native.bridgeAvailable || evidence.native.writerAutoStarted || evidence.native.terminalOpened
  ) failures.push("The native app origin or background-writer bridge check failed.");

  if (
    evidence.deployments.studio.siteId !== trusted.studioSiteId ||
    evidence.deployments.studio.deployId !== trusted.studioDeployId ||
    evidence.deployments.studio.commitRef !== trusted.studioCommitRef
  ) failures.push("The Studio evidence is not bound to the trusted deploy and commit.");
  if (
    evidence.deployments.blogPreview.siteId !== trusted.blogSiteId ||
    evidence.deployments.blogPreview.deployId !== trusted.blogDeployId ||
    evidence.deployments.blogPreview.commitRef !== trusted.blogCommitRef ||
    evidence.deployments.blogPreview.deployUrl !== trusted.blogPreviewOrigin
  ) failures.push("The blog evidence is not bound to the trusted preview deploy and commit.");

  for (const provider of REQUIRED_PROVIDERS) {
    const matches = evidence.providers.filter((item) => item.provider === provider);
    if (matches.length !== 1 || matches[0]!.observed !== matches[0]!.displayed) {
      failures.push(`${provider} does not display its observed provider state truthfully.`);
    }
  }
  if (evidence.providers.length !== REQUIRED_PROVIDERS.length) failures.push("Provider evidence contains an unexpected provider.");

  if (evidence.publicAdminPreview.origin !== trusted.blogPreviewOrigin) failures.push("The public-blog preview origin does not match trusted configuration.");
  for (const route of REQUIRED_ADMIN_ROUTES) {
    const status = evidence.publicAdminPreview.statuses[route];
    if (evidence.environment === "preview" && (status === undefined || !PRE_RETIREMENT_ADMIN_STATUSES[route].includes(status))) {
      failures.push(`Pre-retirement public-admin route ${route} is not healthy.`);
    }
    if (evidence.environment === "production-candidate" && status !== 404) {
      failures.push(`Retirement preview route ${route} did not return 404.`);
    }
  }

  return { approved: failures.length === 0, authorizeRetirementPreview: false, authorizeProductionRetirement: false, failures };
}

function canonicalVerdictPayload(evidence: StudioRolloutEvidence, trusted: TrustedRolloutConfig): string {
  return JSON.stringify({ evidence, trusted, liveChecksPassed: true });
}

function evidenceIsFresh(checkedAt: string): boolean {
  const age = Date.now() - Date.parse(checkedAt);
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= 24 * 60 * 60_000;
}

export function createSignedRolloutVerdict(
  evidence: StudioRolloutEvidence,
  trusted: TrustedRolloutConfig,
  signingSecret: string,
  liveFailures: readonly string[],
): SignedRolloutVerdict {
  const evaluation = evaluateStudioRollout(evidence, trusted);
  if (!evaluation.approved) throw new Error(`Rollout checks failed: ${evaluation.failures.join(" ")}`);
  if (liveFailures.length) throw new Error(`Live rollout checks failed: ${liveFailures.join(" ")}`);
  if (!evidenceIsFresh(evidence.checkedAt)) throw new Error("Rollout evidence must be less than 24 hours old.");
  if (Buffer.byteLength(signingSecret, "utf8") < 32) throw new Error("A rollout signing secret of at least 32 bytes is required.");
  const serialized = canonicalVerdictPayload(evidence, trusted);
  return {
    schemaVersion: 1,
    environment: evidence.environment,
    checkedAt: evidence.checkedAt,
    evidenceDigest: sha256(Buffer.from(JSON.stringify(evidence), "utf8")),
    trustedConfigDigest: sha256(Buffer.from(JSON.stringify(trusted), "utf8")),
    approved: true,
    authorizeRetirementPreview: evidence.environment === "preview",
    authorizeProductionRetirement: evidence.environment === "production-candidate",
    liveChecksPassed: true,
    algorithm: "hmac-sha256",
    signature: createHmac("sha256", signingSecret).update(serialized).digest("hex"),
  };
}

export function verifySignedRolloutVerdict(
  evidence: StudioRolloutEvidence,
  trusted: TrustedRolloutConfig,
  verdict: SignedRolloutVerdict,
  signingSecret: string,
): boolean {
  if (!evaluateStudioRollout(evidence, trusted).approved || !evidenceIsFresh(evidence.checkedAt) || Buffer.byteLength(signingSecret, "utf8") < 32) return false;
  const serialized = canonicalVerdictPayload(evidence, trusted);
  const evidenceDigest = sha256(Buffer.from(JSON.stringify(evidence), "utf8"));
  const trustedConfigDigest = sha256(Buffer.from(JSON.stringify(trusted), "utf8"));
  const signature = createHmac("sha256", signingSecret).update(serialized).digest("hex");
  if (!SHA256.test(verdict.evidenceDigest) || !SHA256.test(verdict.trustedConfigDigest) || !SHA256.test(verdict.signature)) return false;
  return verdict.schemaVersion === 1 && verdict.environment === evidence.environment && verdict.checkedAt === evidence.checkedAt &&
    verdict.approved === true && verdict.liveChecksPassed === true && verdict.algorithm === "hmac-sha256" &&
    verdict.authorizeRetirementPreview === (evidence.environment === "preview") &&
    verdict.authorizeProductionRetirement === (evidence.environment === "production-candidate") &&
    timingSafeEqual(Buffer.from(verdict.evidenceDigest, "hex"), Buffer.from(evidenceDigest, "hex")) &&
    timingSafeEqual(Buffer.from(verdict.trustedConfigDigest, "hex"), Buffer.from(trustedConfigDigest, "hex")) &&
    timingSafeEqual(Buffer.from(verdict.signature, "hex"), Buffer.from(signature, "hex"));
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  return fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

async function boundedBytes(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_LIVE_BODY_BYTES) throw new Error("Live response exceeded the size limit.");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LIVE_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Live response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

async function boundedJson(response: Response): Promise<unknown> {
  return JSON.parse((await boundedBytes(response)).toString("utf8"));
}

export async function verifyLiveEvidence(
  evidence: StudioRolloutEvidence,
  trusted: TrustedRolloutConfig,
  fetchImpl: typeof fetch = fetch,
  netlifyToken: string | undefined = process.env.NETLIFY_AUTH_TOKEN,
): Promise<string[]> {
  const evaluation = evaluateStudioRollout(evidence, trusted);
  if (!evaluation.approved) return ["Static rollout evidence is not trusted; live probes were not attempted."];
  const failures: string[] = [];

  if (!netlifyToken) {
    failures.push("A Netlify token is required to verify immutable deploy identities.");
  } else {
    for (const [label, expected] of [
      ["Studio", { ...evidence.deployments.studio, expectedSiteId: trusted.studioSiteId }],
      ["blog preview", { ...evidence.deployments.blogPreview, expectedSiteId: trusted.blogSiteId }],
    ] as const) {
      try {
        const response = await fetchWithTimeout(fetchImpl, `https://api.netlify.com/api/v1/deploys/${expected.deployId}`, {
          headers: { Authorization: `Bearer ${netlifyToken}` },
        });
        const body = await boundedJson(response) as {
          id?: unknown; site_id?: unknown; commit_ref?: unknown; state?: unknown; deploy_ssl_url?: unknown;
        };
        if (
          response.status !== 200 || body.id !== expected.deployId || body.site_id !== expected.expectedSiteId ||
          body.commit_ref !== expected.commitRef || body.state !== "ready" || body.deploy_ssl_url !== expected.deployUrl
        ) failures.push(`The ${label} Netlify deploy identity did not match the signed candidate.`);
      } catch { failures.push(`The ${label} Netlify deploy identity could not be verified.`); }
    }
  }

  try {
    const manifest = await fetchWithTimeout(fetchImpl, `${trusted.studioOrigin}/manifest.webmanifest`);
    const body = await boundedJson(manifest) as { display?: unknown };
    if (manifest.status !== 200 || body.display !== "standalone") failures.push("Live PWA manifest probe failed.");
  } catch { failures.push("Live PWA manifest probe failed."); }
  try {
    const worker = await fetchWithTimeout(fetchImpl, `${trusted.studioOrigin}/sw.js`);
    if (worker.status !== 200) failures.push("Live service-worker probe failed.");
    await worker.body?.cancel();
  } catch { failures.push("Live service-worker probe failed."); }

  for (const route of REQUIRED_ADMIN_ROUTES) {
    try {
      const response = await fetchWithTimeout(fetchImpl, `${trusted.blogPreviewOrigin}${route}`);
      if (response.status !== evidence.publicAdminPreview.statuses[route]) {
        failures.push(`Live public-admin probe ${route} did not match recorded status.`);
      }
      await response.body?.cancel();
    } catch { failures.push(`Live public-admin probe ${route} failed.`); }
  }

  const identity = publicationIdentity(evidence, trusted);
  if (!identity) return [...failures, "Live GitHub publication identity is invalid."];
  const rawUrl = `https://raw.githubusercontent.com/${trusted.repository}/${identity.commit}/${evidence.publish.articlePath}`;
  try {
    const response = await fetchWithTimeout(fetchImpl, rawUrl);
    const value = await boundedBytes(response);
    if (response.status !== 200 || gitBlobSha(value) !== evidence.publish.gitBlobSha) failures.push("Live GitHub publication blob probe failed.");
  } catch { failures.push("Live GitHub publication blob probe failed."); }

  const branchPath = trusted.previewBranch.split("/").map(encodeURIComponent).join("/");
  try {
    const response = await fetchWithTimeout(fetchImpl, `https://api.github.com/repos/${trusted.repository}/git/ref/heads/${branchPath}`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    const body = await boundedJson(response) as { object?: { sha?: unknown } };
    if (response.status !== 200 || body.object?.sha !== identity.commit) failures.push("Published commit is not the trusted preview branch head.");
  } catch { failures.push("Published commit is not the trusted preview branch head."); }
  return failures;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const environment = option(args, "--environment");
  if (environment !== "preview" && environment !== "production-candidate") throw new Error("Use --environment preview or --environment production-candidate.");
  const evidencePath = resolve(option(args, "--evidence") ?? `.audit/studio-rollout-${environment}.evidence.json`);
  const evidence = parseStudioRolloutEvidence(JSON.parse(await readFile(evidencePath, "utf8")));
  if (evidence.environment !== environment) throw new Error("Evidence environment does not match the requested environment.");
  const trusted = parseTrustedRolloutConfig();
  const secret = process.env.STUDIO_ROLLOUT_SIGNING_SECRET;
  if (!secret) throw new Error("STUDIO_ROLLOUT_SIGNING_SECRET is required; no unsigned verdict can authorize rollout.");
  const verdictPath = option(args, "--verify-verdict");
  if (verdictPath) {
    const currentStudioCommit = option(args, "--current-studio-commit");
    const currentBlogCommit = option(args, "--current-blog-commit");
    if (currentStudioCommit !== trusted.studioCommitRef || currentBlogCommit !== trusted.blogCommitRef) {
      throw new Error("The deployment consumer commits do not match the signed rollout candidates.");
    }
    const verdict = JSON.parse(await readFile(resolve(verdictPath), "utf8")) as SignedRolloutVerdict;
    if (!verifySignedRolloutVerdict(evidence, trusted, verdict, secret)) {
      throw new Error("The signed rollout verdict is invalid for these exact deploys and commits.");
    }
    process.stdout.write(`Studio ${environment} verdict matches the exact deployment candidates.\n`);
    return;
  }
  const evaluation = evaluateStudioRollout(evidence, trusted);
  const liveFailures = await verifyLiveEvidence(evidence, trusted);
  const failures = [...evaluation.failures, ...liveFailures];
  if (failures.length) throw new Error(`Rollout checks failed:\n- ${failures.join("\n- ")}`);
  const verdict = createSignedRolloutVerdict(evidence, trusted, secret, liveFailures);
  const outputPath = resolve(option(args, "--output") ?? `.audit/studio-rollout-${environment}.verdict.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(verdict, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  process.stdout.write(`Studio ${environment} rollout verified. Signed verdict: ${outputPath}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Rollout verification failed."}\n`);
    process.exitCode = 1;
  });
}
