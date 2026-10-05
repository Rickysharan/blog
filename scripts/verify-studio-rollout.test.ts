import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSignedRolloutVerdict,
  evaluateStudioRollout,
  gitBlobSha,
  verifySignedRolloutVerdict,
  verifyLiveEvidence,
  type StudioRolloutEvidence,
} from "./verify-studio-rollout";

const version = (letter: string) => letter.repeat(40);
const bytes = Buffer.from("---\ntitle: Controlled preview\n---\nExact bytes.\n", "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");

function passingEvidence(): StudioRolloutEvidence {
  return {
    schemaVersion: 1,
    environment: "preview",
    checkedAt: new Date().toISOString(),
    studioOrigin: "https://studio-preview.example.net",
    auth: {
      expectedOperator: "operator@example.com",
      authenticatedOperator: "operator@example.com",
      callbackOrigin: "https://studio-preview.example.net",
    },
    read: {
      draftPath: "content/drafts/anime/controlled-preview.mdx",
      version: version("a"),
      bytesSha256: sha256,
    },
    save: {
      priorVersion: version("a"),
      savedVersion: version("b"),
      submittedBytesSha256: sha256,
      readBackBytesSha256: sha256,
    },
    publish: {
      repository: "Rickysharan/blog",
      branch: "studio-preview-content",
      productionBranch: "main",
      articlePath: "content/articles/anime/controlled-preview.mdx",
      reviewedBytesBase64: bytes.toString("base64"),
      publishedBytesBase64: bytes.toString("base64"),
      gitBlobSha: gitBlobSha(bytes),
      publicationUrl: `https://github.com/Rickysharan/blog/blob/${version("c")}/content/articles/anime/controlled-preview.mdx`,
    },
    pwa: {
      manifestUrl: "https://studio-preview.example.net/manifest.webmanifest",
      manifestStatus: 200,
      serviceWorkerStatus: 200,
      display: "standalone",
      installable: true,
      privateRoutesNetworkOnly: true,
    },
    native: {
      configuredOrigin: "https://studio-preview.example.net",
      bridgeOrigin: "https://studio-preview.example.net",
      bridgeAvailable: true,
      writerAutoStarted: false,
      terminalOpened: false,
    },
    providers: [
      { provider: "google-analytics", observed: "connected", displayed: "connected" },
      { provider: "google-search-console", observed: "unavailable", displayed: "unavailable" },
      { provider: "google-adsense", observed: "disconnected", displayed: "disconnected" },
    ],
    publicAdminPreview: {
      origin: "https://blog-preview.example.net",
      statuses: {
        "/admin/login": 404,
        "/admin/review": 404,
        "/api/admin/login": 404,
        "/api/admin/logout": 404,
        "/api/admin/drafts": 404,
        "/api/admin/drafts/anime/retirement-probe.mdx": 404,
      },
    },
  };
}

describe("Studio rollout gate", () => {
  it("approves a complete preview without granting an unsigned retirement authorization", () => {
    const result = evaluateStudioRollout(passingEvidence());
    expect(result).toMatchObject({ approved: true, authorizeAdminRetirement: false, failures: [] });
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
    ["public admin preview", (value: StudioRolloutEvidence) => { value.publicAdminPreview.statuses["/admin/review"] = 200; }],
  ])("refuses approval when %s fails", (_name, breakEvidence) => {
    const evidence = passingEvidence();
    breakEvidence(evidence);
    expect(evaluateStudioRollout(evidence)).toMatchObject({ approved: false, authorizeAdminRetirement: false });
  });

  it.each(["main", "master", "production", "refs/heads/main"])("refuses the production branch %s", (branch) => {
    const evidence = passingEvidence();
    evidence.publish.branch = branch;
    expect(evaluateStudioRollout(evidence)).toMatchObject({ approved: false, authorizeAdminRetirement: false });
  });

  it("only authorizes retirement with a complete signed verdict", () => {
    const failed = passingEvidence();
    failed.pwa.installable = false;
    expect(() => createSignedRolloutVerdict(failed, "a sufficiently long test-only signing secret", [])).toThrow(/failed/i);
    expect(() => createSignedRolloutVerdict(
      passingEvidence(),
      "a sufficiently long test-only signing secret",
      ["live public-admin probe failed"],
    )).toThrow(/live/i);

    const evidence = passingEvidence();
    const verdict = createSignedRolloutVerdict(
      evidence,
      "a sufficiently long test-only signing secret",
      [],
    );
    expect(verdict).toMatchObject({ approved: true, authorizeAdminRetirement: true, liveChecksPassed: true, algorithm: "hmac-sha256" });
    expect(verdict.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignedRolloutVerdict(evidence, verdict, "a sufficiently long test-only signing secret")).toBe(true);
    const altered = passingEvidence();
    altered.native.writerAutoStarted = true;
    expect(verifySignedRolloutVerdict(altered, verdict, "a sufficiently long test-only signing secret")).toBe(false);
  });

  it("performs bounded live checks against the PWA, retired routes, and published Git blob", async () => {
    const requested: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/manifest.webmanifest")) return Response.json({ display: "standalone" });
      if (url.endsWith("/sw.js")) return new Response("worker");
      if (url.startsWith("https://raw.githubusercontent.com/")) return new Response(bytes);
      return new Response("missing", { status: 404 });
    };
    expect(await verifyLiveEvidence(passingEvidence(), fetchImpl as typeof fetch)).toEqual([]);
    expect(requested).toHaveLength(9);
  });
});
