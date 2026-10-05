import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  OMNILEDE_BLOG_SITE_ID,
  OMNILEDE_PREVIEW_BRANCH,
  OMNILEDE_PRODUCTION_BRANCH,
  OMNILEDE_REPOSITORY,
  OMNILEDE_STUDIO_ORIGIN,
  OMNILEDE_STUDIO_SITE_ID,
  createSignedRolloutVerdict,
  evaluateStudioRollout,
  gitBlobSha,
  parseStudioRolloutEvidence,
  parseTrustedRolloutConfig,
  verifySignedRolloutVerdict,
  verifyLiveEvidence,
  type StudioRolloutEvidence,
  type TrustedRolloutConfig,
} from "./verify-studio-rollout";

const version = (letter: string) => letter.repeat(40);
const bytes = Buffer.from("---\ntitle: Controlled preview\n---\nExact bytes.\n", "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const secret = "a sufficiently long test-only signing secret";
const studioCommit = version("e");
const blogCommit = version("f");
const studioDeployUrl = "https://studio-deploy--omnilede-studio.netlify.app";
const blogDeployUrl = "https://blog-deploy--omnilede-news.netlify.app";

function trustedConfig(): TrustedRolloutConfig {
  return {
    studioOrigin: OMNILEDE_STUDIO_ORIGIN,
    blogPreviewOrigin: blogDeployUrl,
    operatorEmail: "operator@example.com",
    oauthCallbackUrl: `${OMNILEDE_STUDIO_ORIGIN}/api/connections/google/callback`,
    repository: OMNILEDE_REPOSITORY,
    previewBranch: OMNILEDE_PREVIEW_BRANCH,
    productionBranch: OMNILEDE_PRODUCTION_BRANCH,
    studioSiteId: OMNILEDE_STUDIO_SITE_ID,
    studioDeployId: "studio-deploy",
    studioCommitRef: studioCommit,
    blogSiteId: OMNILEDE_BLOG_SITE_ID,
    blogDeployId: "blog-deploy",
    blogCommitRef: blogCommit,
  };
}

function passingEvidence(environment: StudioRolloutEvidence["environment"] = "preview"): StudioRolloutEvidence {
  const statuses = environment === "production-candidate"
    ? Object.fromEntries(adminRoutes.map((route) => [route, 404]))
    : {
        "/admin/login": 200,
        "/admin/review": 307,
        "/api/admin/login": 405,
        "/api/admin/logout": 405,
        "/api/admin/drafts": 401,
        "/api/admin/drafts/anime/retirement-probe.mdx": 401,
      };
  return {
    schemaVersion: 1,
    environment,
    checkedAt: new Date().toISOString(),
    studioOrigin: OMNILEDE_STUDIO_ORIGIN,
    auth: {
      expectedOperator: "operator@example.com",
      authenticatedOperator: "operator@example.com",
      callbackUrl: `${OMNILEDE_STUDIO_ORIGIN}/api/connections/google/callback`,
    },
    read: { draftPath: "content/drafts/anime/controlled-preview.mdx", version: version("a"), bytesSha256: sha256 },
    save: { priorVersion: version("a"), savedVersion: version("b"), submittedBytesSha256: sha256, readBackBytesSha256: sha256 },
    publish: {
      repository: OMNILEDE_REPOSITORY,
      branch: OMNILEDE_PREVIEW_BRANCH,
      productionBranch: OMNILEDE_PRODUCTION_BRANCH,
      articlePath: "content/articles/anime/controlled-preview.mdx",
      reviewedBytesBase64: bytes.toString("base64"),
      publishedBytesBase64: bytes.toString("base64"),
      gitBlobSha: gitBlobSha(bytes),
      publicationUrl: `https://github.com/${OMNILEDE_REPOSITORY}/blob/${version("c")}/content/articles/anime/controlled-preview.mdx`,
    },
    pwa: {
      manifestUrl: `${OMNILEDE_STUDIO_ORIGIN}/manifest.webmanifest`, manifestStatus: 200, serviceWorkerStatus: 200,
      display: "standalone", installable: true, privateRoutesNetworkOnly: true,
    },
    native: {
      configuredOrigin: OMNILEDE_STUDIO_ORIGIN, bridgeOrigin: OMNILEDE_STUDIO_ORIGIN,
      bridgeAvailable: true, writerAutoStarted: false, terminalOpened: false,
    },
    deployments: {
      studio: { siteId: OMNILEDE_STUDIO_SITE_ID, deployId: "studio-deploy", commitRef: studioCommit, deployUrl: studioDeployUrl },
      blogPreview: { siteId: OMNILEDE_BLOG_SITE_ID, deployId: "blog-deploy", commitRef: blogCommit, deployUrl: blogDeployUrl },
    },
    providers: [
      { provider: "google-analytics", observed: "connected", displayed: "connected" },
      { provider: "google-search-console", observed: "unavailable", displayed: "unavailable" },
      { provider: "google-adsense", observed: "disconnected", displayed: "disconnected" },
    ],
    publicAdminPreview: { origin: trustedConfig().blogPreviewOrigin, statuses },
  };
}

const adminRoutes = [
  "/admin/login", "/admin/review", "/api/admin/login", "/api/admin/logout", "/api/admin/drafts",
  "/api/admin/drafts/anime/retirement-probe.mdx",
] as const;

describe("Studio rollout gate", () => {
  it("approves complete pre-retirement evidence without unsigned authorization", () => {
    expect(evaluateStudioRollout(passingEvidence(), trustedConfig())).toEqual({
      approved: true, authorizeRetirementPreview: false, authorizeProductionRetirement: false, failures: [],
    });
  });

  it.each([
    ["exact operator", (value: StudioRolloutEvidence) => { value.auth.authenticatedOperator = "other@example.com"; }],
    ["draft read", (value: StudioRolloutEvidence) => { value.read.version = "not-a-version"; }],
    ["versioned save", (value: StudioRolloutEvidence) => { value.save.savedVersion = value.save.priorVersion; }],
    ["exact-byte publish", (value: StudioRolloutEvidence) => { value.publish.publishedBytesBase64 = Buffer.from("changed").toString("base64"); }],
    ["Git blob receipt", (value: StudioRolloutEvidence) => { value.publish.gitBlobSha = version("f"); }],
    ["PWA manifest", (value: StudioRolloutEvidence) => { value.pwa.manifestStatus = 500; }],
    ["network-only private routes", (value: StudioRolloutEvidence) => { value.pwa.privateRoutesNetworkOnly = false; }],
    ["native origin", (value: StudioRolloutEvidence) => { value.native.bridgeOrigin = "https://other.example.net"; }],
    ["no automatic writer", (value: StudioRolloutEvidence) => { value.native.writerAutoStarted = true; }],
    ["no Terminal", (value: StudioRolloutEvidence) => { value.native.terminalOpened = true; }],
    ["provider truth", (value: StudioRolloutEvidence) => { value.providers[1]!.displayed = "connected"; }],
  ])("refuses approval when %s fails", (_name, breakEvidence) => {
    const evidence = passingEvidence();
    breakEvidence(evidence);
    expect(evaluateStudioRollout(evidence, trustedConfig())).toMatchObject({ approved: false, authorizeRetirementPreview: false, authorizeProductionRetirement: false });
  });

  it.each([
    ["Studio origin", (value: StudioRolloutEvidence) => { value.studioOrigin = "https://attacker.example"; }],
    ["OAuth callback", (value: StudioRolloutEvidence) => { value.auth.callbackUrl = "https://attacker.example/callback"; }],
    ["claimed operator", (value: StudioRolloutEvidence) => { value.auth.expectedOperator = value.auth.authenticatedOperator = "attacker@example.com"; }],
    ["repository", (value: StudioRolloutEvidence) => { value.publish.repository = "attacker/repo"; }],
    ["preview branch", (value: StudioRolloutEvidence) => { value.publish.branch = "attacker-preview"; }],
    ["production branch", (value: StudioRolloutEvidence) => { value.publish.productionBranch = "release"; }],
    ["blog preview", (value: StudioRolloutEvidence) => { value.publicAdminPreview.origin = "https://attacker.example"; }],
  ])("refuses caller-selected %s", (_name, mutate) => {
    const evidence = passingEvidence();
    mutate(evidence);
    expect(evaluateStudioRollout(evidence, trustedConfig()).approved).toBe(false);
  });

  it("runtime-validates provider states and rejects extra providers", () => {
    const invalid = passingEvidence() as unknown as { providers: Array<Record<string, string>> };
    invalid.providers[0]!.observed = "invented";
    expect(() => parseStudioRolloutEvidence(invalid)).toThrow();
    const extra = passingEvidence();
    extra.providers.push({ provider: "attacker", observed: "connected", displayed: "connected" });
    expect(evaluateStudioRollout(extra, trustedConfig()).approved).toBe(false);
  });

  it("requires admin to remain present before authorizing a retirement preview", () => {
    const evidence = passingEvidence("preview");
    evidence.publicAdminPreview.statuses["/admin/review"] = 404;
    expect(evaluateStudioRollout(evidence, trustedConfig()).failures).toContain("Pre-retirement public-admin route /admin/review is not healthy.");
  });

  it.each([404, 429, 500, 503])("rejects unhealthy pre-retirement admin status %s", (status) => {
    const evidence = passingEvidence("preview");
    evidence.publicAdminPreview.statuses["/admin/review"] = status;
    expect(evaluateStudioRollout(evidence, trustedConfig()).approved).toBe(false);
  });

  it("requires every admin route to be 404 before authorizing production retirement", () => {
    const evidence = passingEvidence("production-candidate");
    evidence.publicAdminPreview.statuses["/admin/review"] = 200;
    expect(evaluateStudioRollout(evidence, trustedConfig()).failures).toContain("Retirement preview route /admin/review did not return 404.");
  });

  it("issues distinct signed authorizations for retirement preview and production deployment", () => {
    const preview = passingEvidence("preview");
    const previewVerdict = createSignedRolloutVerdict(preview, trustedConfig(), secret, []);
    expect(previewVerdict).toMatchObject({ authorizeRetirementPreview: true, authorizeProductionRetirement: false });
    expect(verifySignedRolloutVerdict(preview, trustedConfig(), previewVerdict, secret)).toBe(true);

    const production = passingEvidence("production-candidate");
    const productionVerdict = createSignedRolloutVerdict(production, trustedConfig(), secret, []);
    expect(productionVerdict).toMatchObject({ authorizeRetirementPreview: false, authorizeProductionRetirement: true });
    expect(verifySignedRolloutVerdict(production, trustedConfig(), productionVerdict, secret)).toBe(true);
  });

  it("binds a verdict to trusted configuration and rejects failed or stale evidence", () => {
    const evidence = passingEvidence();
    const verdict = createSignedRolloutVerdict(evidence, trustedConfig(), secret, []);
    const changedTrust = { ...trustedConfig(), blogPreviewOrigin: "https://different-preview.example.net" };
    expect(verifySignedRolloutVerdict(evidence, changedTrust, verdict, secret)).toBe(false);
    expect(() => createSignedRolloutVerdict(evidence, trustedConfig(), secret, ["live failure"])).toThrow(/live/i);
    evidence.checkedAt = "2020-01-01T00:00:00.000Z";
    expect(() => createSignedRolloutVerdict(evidence, trustedConfig(), secret, [])).toThrow(/24 hours/i);
  });

  it("loads only the two variable trusted values from environment", () => {
    expect(parseTrustedRolloutConfig({
      STUDIO_ROLLOUT_BLOG_PREVIEW_ORIGIN: "https://preview.example.net",
      STUDIO_ROLLOUT_EXPECTED_OPERATOR_EMAIL: "Operator@Example.com",
      STUDIO_ROLLOUT_STUDIO_DEPLOY_ID: "studio-deploy",
      STUDIO_ROLLOUT_STUDIO_COMMIT: studioCommit,
      STUDIO_ROLLOUT_BLOG_DEPLOY_ID: "blog-deploy",
      STUDIO_ROLLOUT_BLOG_COMMIT: blogCommit,
    })).toEqual({ ...trustedConfig(), blogPreviewOrigin: "https://preview.example.net" });
  });

  it("probes only trusted endpoints, exact recorded admin statuses, the blob, and preview branch head", async () => {
    const evidence = passingEvidence();
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url === `${studioDeployUrl}/manifest.webmanifest`) return Response.json({ display: "standalone" });
      if (url === `${studioDeployUrl}/sw.js`) return new Response("worker");
      if (url.endsWith("/deploys/studio-deploy")) return Response.json({ id: "studio-deploy", site_id: OMNILEDE_STUDIO_SITE_ID, commit_ref: studioCommit, state: "ready", deploy_ssl_url: studioDeployUrl });
      if (url.endsWith("/deploys/blog-deploy")) return Response.json({ id: "blog-deploy", site_id: OMNILEDE_BLOG_SITE_ID, commit_ref: blogCommit, state: "ready", deploy_ssl_url: blogDeployUrl });
      if (url.endsWith(`/sites/${OMNILEDE_STUDIO_SITE_ID}`)) return Response.json({ published_deploy: { id: "studio-deploy" } });
      if (url.startsWith(`https://raw.githubusercontent.com/${OMNILEDE_REPOSITORY}/`)) return new Response(bytes);
      if (url.includes("api.github.com")) return Response.json({ object: { sha: version("c") } });
      const route = url.replace(trustedConfig().blogPreviewOrigin, "");
      return new Response(null, { status: evidence.publicAdminPreview.statuses[route] ?? 500 });
    });
    expect(await verifyLiveEvidence(evidence, trustedConfig(), fetchImpl as typeof fetch, "test-token")).toEqual([]);
    expect(requested).toHaveLength(13);
    expect(requested.every((url) => !url.includes("attacker"))).toBe(true);
  });

  it("does not probe caller-selected endpoints when static trust binding fails", async () => {
    const evidence = passingEvidence();
    evidence.studioOrigin = "https://attacker.example";
    const fetchImpl = vi.fn();
    expect(await verifyLiveEvidence(evidence, trustedConfig(), fetchImpl as typeof fetch, "test-token")).toEqual([
      "Static rollout evidence is not trusted; live probes were not attempted.",
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a publication commit that is not the trusted preview branch head", async () => {
    const evidence = passingEvidence();
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/manifest.webmanifest")) return Response.json({ display: "standalone" });
      if (url.endsWith("/sw.js")) return new Response("worker");
      if (url.endsWith("/deploys/studio-deploy")) return Response.json({ id: "studio-deploy", site_id: OMNILEDE_STUDIO_SITE_ID, commit_ref: studioCommit, state: "ready", deploy_ssl_url: studioDeployUrl });
      if (url.endsWith("/deploys/blog-deploy")) return Response.json({ id: "blog-deploy", site_id: OMNILEDE_BLOG_SITE_ID, commit_ref: blogCommit, state: "ready", deploy_ssl_url: blogDeployUrl });
      if (url.endsWith(`/sites/${OMNILEDE_STUDIO_SITE_ID}`)) return Response.json({ published_deploy: { id: "studio-deploy" } });
      if (url.startsWith("https://raw.githubusercontent.com/")) return new Response(bytes);
      if (url.includes("api.github.com")) return Response.json({ object: { sha: version("d") } });
      const route = url.replace(trustedConfig().blogPreviewOrigin, "");
      return new Response(null, { status: evidence.publicAdminPreview.statuses[route] ?? 500 });
    };
    expect(await verifyLiveEvidence(evidence, trustedConfig(), fetchImpl as typeof fetch, "test-token")).toContain("Published commit is not the trusted preview branch head.");
  });

  it("bounds live response bodies", async () => {
    const evidence = passingEvidence();
    const fetchImpl = vi.fn(async () => new Response("x".repeat(1024 * 1024 + 1)));
    expect(await verifyLiveEvidence(evidence, trustedConfig(), fetchImpl as typeof fetch, "test-token")).toContain("Live PWA manifest probe failed.");
  });

  it("rejects a signed Studio deploy that is not currently published", async () => {
    const evidence = passingEvidence();
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith(`/sites/${OMNILEDE_STUDIO_SITE_ID}`)) return Response.json({ published_deploy: { id: "different-deploy" } });
      if (url.endsWith("/deploys/studio-deploy")) return Response.json({ id: "studio-deploy", site_id: OMNILEDE_STUDIO_SITE_ID, commit_ref: studioCommit, state: "ready", deploy_ssl_url: studioDeployUrl });
      if (url.endsWith("/deploys/blog-deploy")) return Response.json({ id: "blog-deploy", site_id: OMNILEDE_BLOG_SITE_ID, commit_ref: blogCommit, state: "ready", deploy_ssl_url: blogDeployUrl });
      if (url.endsWith("/manifest.webmanifest")) return Response.json({ display: "standalone" });
      if (url.endsWith("/sw.js")) return new Response("worker");
      if (url.startsWith("https://raw.githubusercontent.com/")) return new Response(bytes);
      if (url.includes("api.github.com")) return Response.json({ object: { sha: version("c") } });
      const route = url.replace(trustedConfig().blogPreviewOrigin, "");
      return new Response(null, { status: evidence.publicAdminPreview.statuses[route] ?? 500 });
    };
    expect(await verifyLiveEvidence(evidence, trustedConfig(), fetchImpl as typeof fetch, "test-token")).toContain(
      "The stable Studio origin is not publishing the signed Studio deploy.",
    );
  });
});
