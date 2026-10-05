import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ProviderTruthState = "connected" | "delayed" | "stale" | "unavailable" | "disconnected";

export interface StudioRolloutEvidence {
  schemaVersion: 1;
  environment: "preview" | "production-candidate";
  checkedAt: string;
  studioOrigin: string;
  auth: { expectedOperator: string; authenticatedOperator: string; callbackOrigin: string };
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
  providers: Array<{ provider: string; observed: ProviderTruthState; displayed: ProviderTruthState }>;
  publicAdminPreview: { origin: string; statuses: Record<string, number> };
}

export interface RolloutEvaluation {
  approved: boolean;
  authorizeAdminRetirement: false;
  failures: string[];
}

export interface SignedRolloutVerdict {
  schemaVersion: 1;
  environment: StudioRolloutEvidence["environment"];
  checkedAt: string;
  evidenceDigest: string;
  approved: true;
  authorizeAdminRetirement: true;
  liveChecksPassed: true;
  algorithm: "hmac-sha256";
  signature: string;
}

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CONTENT_PATH = /^content\/(?:drafts|articles)\/[a-z0-9-]+\/[a-z0-9-]+\.mdx$/;
const RESERVED_BRANCHES = new Set(["main", "master", "production", "prod"]);
const REQUIRED_PROVIDERS = ["google-analytics", "google-search-console", "google-adsense"] as const;
const REQUIRED_ADMIN_ROUTES = [
  "/admin/login",
  "/admin/review",
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/drafts",
  "/api/admin/drafts/anime/retirement-probe.mdx",
] as const;

function safeHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.origin === value.replace(/\/$/, "")
      ? url.origin
      : null;
  } catch {
    return null;
  }
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

function publicationUrlMatches(evidence: StudioRolloutEvidence): boolean {
  try {
    const url = new URL(evidence.publish.publicationUrl);
    const [owner, repository] = evidence.publish.repository.split("/");
    const prefix = `/${owner}/${repository}/blob/`;
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith(prefix)) return false;
    const remainder = url.pathname.slice(prefix.length);
    const separator = remainder.indexOf("/");
    const commit = remainder.slice(0, separator);
    const path = decodeURIComponent(remainder.slice(separator + 1));
    return separator > 0 && SHA40.test(commit) && path === evidence.publish.articlePath;
  } catch {
    return false;
  }
}

export function evaluateStudioRollout(evidence: StudioRolloutEvidence): RolloutEvaluation {
  const failures: string[] = [];
  const studioOrigin = safeHttpsOrigin(evidence.studioOrigin);
  if (evidence.schemaVersion !== 1) failures.push("Unsupported evidence schema.");
  if (!studioOrigin) failures.push("Studio origin must be an exact HTTPS origin.");
  if (!Number.isFinite(Date.parse(evidence.checkedAt))) failures.push("Evidence timestamp is invalid.");

  if (!evidence.auth.expectedOperator || evidence.auth.authenticatedOperator !== evidence.auth.expectedOperator) {
    failures.push("The authenticated operator does not exactly match the configured operator.");
  }
  if (!studioOrigin || safeHttpsOrigin(evidence.auth.callbackOrigin) !== studioOrigin) {
    failures.push("The authenticated callback origin does not match Studio.");
  }

  if (!CONTENT_PATH.test(evidence.read.draftPath) || !evidence.read.draftPath.startsWith("content/drafts/")) {
    failures.push("The controlled draft read path is invalid.");
  }
  if (!SHA40.test(evidence.read.version) || !SHA256.test(evidence.read.bytesSha256)) {
    failures.push("The controlled draft read has no immutable version and byte digest.");
  }
  if (
    !SHA40.test(evidence.save.priorVersion) ||
    !SHA40.test(evidence.save.savedVersion) ||
    evidence.save.priorVersion !== evidence.read.version ||
    evidence.save.savedVersion === evidence.save.priorVersion ||
    !SHA256.test(evidence.save.submittedBytesSha256) ||
    evidence.save.submittedBytesSha256 !== evidence.save.readBackBytesSha256
  ) {
    failures.push("The controlled save was not versioned and read back byte-for-byte.");
  }

  const reviewedBytes = decodeCanonicalBase64(evidence.publish.reviewedBytesBase64);
  const publishedBytes = decodeCanonicalBase64(evidence.publish.publishedBytesBase64);
  const exactPublishedBytes = Boolean(
    reviewedBytes &&
    publishedBytes &&
    reviewedBytes.byteLength === publishedBytes.byteLength &&
    timingSafeEqual(reviewedBytes, publishedBytes),
  );
  const safeBranch = evidence.publish.branch.replace(/^refs\/heads\//, "");
  const productionBranch = evidence.publish.productionBranch.replace(/^refs\/heads\//, "");
  if (
    !safeBranch ||
    safeBranch === productionBranch ||
    RESERVED_BRANCHES.has(safeBranch.toLowerCase()) ||
    safeBranch.includes("..") ||
    safeBranch.startsWith("/") ||
    safeBranch.endsWith("/")
  ) {
    failures.push("Controlled publishing must target a dedicated non-production branch.");
  }
  if (!REPOSITORY.test(evidence.publish.repository)) failures.push("The controlled publication repository is invalid.");
  if (!CONTENT_PATH.test(evidence.publish.articlePath) || !evidence.publish.articlePath.startsWith("content/articles/")) {
    failures.push("The controlled publication article path is invalid.");
  }
  if (
    !exactPublishedBytes ||
    evidence.publish.gitBlobSha !== gitBlobSha(publishedBytes ?? Buffer.alloc(0)) ||
    sha256(reviewedBytes ?? Buffer.alloc(0)) !== evidence.save.readBackBytesSha256 ||
    !publicationUrlMatches(evidence)
  ) {
    failures.push("The controlled publication does not prove exact reviewed bytes and a matching Git blob receipt.");
  }

  if (
    !studioOrigin ||
    evidence.pwa.manifestUrl !== `${studioOrigin}/manifest.webmanifest` ||
    evidence.pwa.manifestStatus !== 200 ||
    evidence.pwa.serviceWorkerStatus !== 200 ||
    evidence.pwa.display !== "standalone" ||
    !evidence.pwa.installable ||
    !evidence.pwa.privateRoutesNetworkOnly
  ) {
    failures.push("The Studio PWA is not installable with network-only private routes.");
  }

  if (
    !studioOrigin ||
    safeHttpsOrigin(evidence.native.configuredOrigin) !== studioOrigin ||
    safeHttpsOrigin(evidence.native.bridgeOrigin) !== studioOrigin ||
    !evidence.native.bridgeAvailable ||
    evidence.native.writerAutoStarted ||
    evidence.native.terminalOpened
  ) {
    failures.push("The native app origin or background-writer bridge check failed.");
  }

  for (const provider of REQUIRED_PROVIDERS) {
    const matches = evidence.providers.filter((item) => item.provider === provider);
    if (matches.length !== 1 || matches[0]!.observed !== matches[0]!.displayed) {
      failures.push(`${provider} does not display its observed provider state truthfully.`);
    }
  }

  if (!safeHttpsOrigin(evidence.publicAdminPreview.origin)) failures.push("The public-blog preview origin is invalid.");
  for (const route of REQUIRED_ADMIN_ROUTES) {
    if (evidence.publicAdminPreview.statuses[route] !== 404) {
      failures.push(`Public-blog preview route ${route} did not return 404.`);
    }
  }

  return { approved: failures.length === 0, authorizeAdminRetirement: false, failures };
}

function canonicalVerdictPayload(evidence: StudioRolloutEvidence): string {
  return JSON.stringify({ evidence, liveChecksPassed: true });
}

function evidenceIsFresh(checkedAt: string): boolean {
  const age = Date.now() - Date.parse(checkedAt);
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= 24 * 60 * 60_000;
}

export function createSignedRolloutVerdict(
  evidence: StudioRolloutEvidence,
  signingSecret: string,
  liveFailures: readonly string[],
): SignedRolloutVerdict {
  const evaluation = evaluateStudioRollout(evidence);
  if (!evaluation.approved) throw new Error(`Rollout checks failed: ${evaluation.failures.join(" ")}`);
  if (liveFailures.length) throw new Error(`Live rollout checks failed: ${liveFailures.join(" ")}`);
  if (!evidenceIsFresh(evidence.checkedAt)) throw new Error("Rollout evidence must be less than 24 hours old.");
  if (Buffer.byteLength(signingSecret, "utf8") < 32) throw new Error("A rollout signing secret of at least 32 bytes is required.");
  const serialized = canonicalVerdictPayload(evidence);
  const evidenceDigest = sha256(Buffer.from(serialized, "utf8"));
  return {
    schemaVersion: 1,
    environment: evidence.environment,
    checkedAt: evidence.checkedAt,
    evidenceDigest,
    approved: true,
    authorizeAdminRetirement: true,
    liveChecksPassed: true,
    algorithm: "hmac-sha256",
    signature: createHmac("sha256", signingSecret).update(serialized).digest("hex"),
  };
}

export function verifySignedRolloutVerdict(
  evidence: StudioRolloutEvidence,
  verdict: SignedRolloutVerdict,
  signingSecret: string,
): boolean {
  if (!evaluateStudioRollout(evidence).approved || !evidenceIsFresh(evidence.checkedAt) || Buffer.byteLength(signingSecret, "utf8") < 32) return false;
  const serialized = canonicalVerdictPayload(evidence);
  const digest = sha256(Buffer.from(serialized, "utf8"));
  const signature = createHmac("sha256", signingSecret).update(serialized).digest("hex");
  if (!SHA256.test(verdict.evidenceDigest) || !SHA256.test(verdict.signature)) return false;
  return verdict.schemaVersion === 1 &&
    verdict.environment === evidence.environment &&
    verdict.checkedAt === evidence.checkedAt &&
    verdict.approved === true &&
    verdict.authorizeAdminRetirement === true &&
    verdict.liveChecksPassed === true &&
    verdict.algorithm === "hmac-sha256" &&
    timingSafeEqual(Buffer.from(verdict.evidenceDigest, "hex"), Buffer.from(digest, "hex")) &&
    timingSafeEqual(Buffer.from(verdict.signature, "hex"), Buffer.from(signature, "hex"));
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  return fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

export async function verifyLiveEvidence(evidence: StudioRolloutEvidence, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const failures: string[] = [];
  const studioOrigin = safeHttpsOrigin(evidence.studioOrigin);
  const blogOrigin = safeHttpsOrigin(evidence.publicAdminPreview.origin);
  if (!studioOrigin || !blogOrigin) return ["Live probes require valid HTTPS preview origins."];

  try {
    const manifest = await fetchWithTimeout(fetchImpl, `${studioOrigin}/manifest.webmanifest`);
    const body = await manifest.json() as { display?: unknown };
    if (manifest.status !== 200 || body.display !== "standalone") failures.push("Live PWA manifest probe failed.");
  } catch {
    failures.push("Live PWA manifest probe failed.");
  }
  try {
    const worker = await fetchWithTimeout(fetchImpl, `${studioOrigin}/sw.js`);
    if (worker.status !== 200) failures.push("Live service-worker probe failed.");
  } catch {
    failures.push("Live service-worker probe failed.");
  }
  for (const route of REQUIRED_ADMIN_ROUTES) {
    try {
      const response = await fetchWithTimeout(fetchImpl, `${blogOrigin}${route}`);
      if (response.status !== 404) failures.push(`Live public-admin probe ${route} returned ${response.status}.`);
    } catch {
      failures.push(`Live public-admin probe ${route} failed.`);
    }
  }
  if (REPOSITORY.test(evidence.publish.repository) && publicationUrlMatches(evidence)) {
    const publication = new URL(evidence.publish.publicationUrl);
    const marker = "/blob/";
    const remainder = publication.pathname.slice(publication.pathname.indexOf(marker) + marker.length);
    const separator = remainder.indexOf("/");
    const commit = remainder.slice(0, separator);
    const rawUrl = `https://raw.githubusercontent.com/${evidence.publish.repository}/${commit}/${evidence.publish.articlePath}`;
    try {
      const response = await fetchWithTimeout(fetchImpl, rawUrl);
      const value = Buffer.from(await response.arrayBuffer());
      if (response.status !== 200 || gitBlobSha(value) !== evidence.publish.gitBlobSha) {
        failures.push("Live GitHub publication blob probe failed.");
      }
    } catch {
      failures.push("Live GitHub publication blob probe failed.");
    }
  }
  return failures;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const environment = option(args, "--environment");
  if (environment !== "preview" && environment !== "production-candidate") {
    throw new Error("Use --environment preview or --environment production-candidate.");
  }
  const evidencePath = resolve(option(args, "--evidence") ?? `.audit/studio-rollout-${environment}.evidence.json`);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as StudioRolloutEvidence;
  if (evidence.environment !== environment) throw new Error("Evidence environment does not match the requested environment.");
  const evaluation = evaluateStudioRollout(evidence);
  const liveFailures = await verifyLiveEvidence(evidence);
  const failures = [...evaluation.failures, ...liveFailures];
  if (failures.length) throw new Error(`Rollout checks failed:\n- ${failures.join("\n- ")}`);
  const secret = process.env.STUDIO_ROLLOUT_SIGNING_SECRET;
  if (!secret) throw new Error("STUDIO_ROLLOUT_SIGNING_SECRET is required; no unsigned verdict can authorize retirement.");
  const verdict = createSignedRolloutVerdict(evidence, secret, liveFailures);
  const outputPath = resolve(option(args, "--output") ?? `.audit/studio-rollout-${environment}.verdict.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(verdict, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Studio ${environment} rollout verified. Signed verdict: ${outputPath}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Rollout verification failed."}\n`);
    process.exitCode = 1;
  });
}
