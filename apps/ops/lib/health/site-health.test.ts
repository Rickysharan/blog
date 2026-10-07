import { describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => vi.fn(async () => []));
vi.mock("../tasks/repository", () => ({ listProviderConnections: providers }));

import { assessSiteHealth, collectSiteHealth } from "./site-health";

const checkedAt = "2026-10-03T12:00:00.000Z";
const url = "https://omnilede.example";

describe("assessSiteHealth", () => {
  it("returns evidence-backed findings for every required check", () => {
    const findings = assessSiteHealth({
      checkedAt,
      publicOrigin: { state: "reachable", url, status: 200 },
      deployment: { state: "failed", url, deployId: "deploy-1", detail: "Build command failed" },
      sitemap: { state: "reachable", url: `${url}/sitemap.xml`, status: 200 },
      robots: { state: "failed", url: `${url}/robots.txt`, status: 503 },
      publication: { state: "failed", url: `${url}/sports/story`, detail: "Publication deployment not ready" },
      providers: [{ provider: "google-analytics", state: "stale", url: `${url}/studio/growth`, lastCheckedAt: "2026-09-01T00:00:00.000Z" }],
      structuredData: { state: "invalid", url: `${url}/sports/story`, detail: "NewsArticle image is missing" },
      internalLinks: { state: "broken", url, detail: "2 internal links returned 404" }
    });

    expect(findings.map(({ check }) => check)).toEqual(expect.arrayContaining([
      "public-origin", "deployment", "sitemap", "robots", "publication", "provider:google-analytics", "structured-data", "internal-links"
    ]));
    for (const finding of findings) {
      expect(finding).toMatchObject({ checkedAt, affectedUrl: expect.stringMatching(/^https:\/\//), evidence: expect.any(String), severity: expect.any(String), recoveryAction: expect.any(String) });
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.recoveryAction.length).toBeGreaterThan(0);
    }
    expect(findings.find(({ check }) => check === "deployment")?.severity).toBe("critical");
  });

  it("labels missing evidence unavailable and does not claim a healthy or zero result", () => {
    const findings = assessSiteHealth({ checkedAt, publicUrl: url });
    expect(findings).toHaveLength(8);
    expect(findings.every(({ state, evidence }) => state === "unavailable" && /unavailable|not connected|not run/i.test(evidence))).toBe(true);
  });

  it("checks the public surfaces and latest Netlify deploy through read-only requests", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const findings = await collectSiteHealth({
      publicUrl: url,
      studioUrl: "https://studio.example",
      now: new Date(checkedAt),
      netlify: { siteId: "site-1", token: "test-only-token" },
      fetchImpl: async (input, init) => {
        const requestUrl = String(input);
        calls.push({ url: requestUrl, authorization: new Headers(init?.headers).get("authorization") });
        if (requestUrl.includes("api.netlify.com")) return Response.json([{ id: "deploy-1", state: "ready", deploy_ssl_url: url }]);
        return new Response("ok", { status: 200 });
      }
    });

    expect(calls.map(({ url: requested }) => requested)).toEqual(expect.arrayContaining([`${url}/`, `${url}/sitemap.xml`, `${url}/robots.txt`, "https://api.netlify.com/api/v1/sites/site-1/deploys?per_page=1"]));
    expect(calls.find(({ url: requested }) => requested.includes("api.netlify.com"))?.authorization).toBe("Bearer test-only-token");
    expect(findings.find(({ check }) => check === "deployment")).toMatchObject({ state: "healthy", affectedUrl: url, evidence: expect.stringContaining("ready") });
    expect(JSON.stringify(findings)).not.toContain("test-only-token");
  });

  it("reports the active Vercel deployment without querying an unrelated saved Netlify project", async () => {
    const vercelUrl = "https://omnilede-news.vercel.app";
    const calls: string[] = [];
    const findings = await collectSiteHealth({
      publicUrl: vercelUrl,
      studioUrl: "https://omnilede-studio.vercel.app",
      now: new Date(checkedAt),
      netlify: { siteId: "old-netlify-site", token: "old-token" },
      fetchImpl: async (input) => {
        calls.push(String(input));
        return new Response("ok", { status: 200, headers: { server: "Vercel" } });
      },
    });

    expect(calls.some((requested) => requested.includes("api.netlify.com"))).toBe(false);
    expect(findings.find(({ check }) => check === "deployment")).toMatchObject({
      state: "healthy",
      affectedUrl: vercelUrl,
      evidence: expect.stringMatching(/active Vercel deployment.*HTTP 200/i),
    });
  });

  it("treats connected provider evidence as unavailable, stale, or healthy by freshness", () => {
    const findings = assessSiteHealth({ checkedAt, publicUrl: url, providers: [
      { provider: "missing-time", state: "connected", url: "https://studio.example/growth", lastCheckedAt: null },
      { provider: "old", state: "connected", url: "https://studio.example/search", lastCheckedAt: "2026-10-01T11:59:59.000Z" },
      { provider: "fresh", state: "connected", url: "https://studio.example/revenue", lastCheckedAt: "2026-10-03T11:30:00.000Z" }
    ] });
    expect(findings.find(({ check }) => check === "provider:missing-time")).toMatchObject({ state: "unavailable", severity: "info", evidence: expect.stringMatching(/never|unavailable/i) });
    expect(findings.find(({ check }) => check === "provider:old")).toMatchObject({ state: "warning", severity: "warning", evidence: expect.stringMatching(/stale/i) });
    expect(findings.find(({ check }) => check === "provider:fresh")).toMatchObject({ state: "healthy", severity: "ok" });
  });

  it("blocks cross-origin redirect chains and never requests the redirected destination", async () => {
    const calls: string[] = [];
    const findings = await collectSiteHealth({ publicUrl: url, studioUrl: "https://studio.example", now: new Date(checkedAt), fetchImpl: async (input) => {
      const requested = String(input); calls.push(requested);
      if (requested === `${url}/`) return new Response(null, { status: 302, headers: { location: "/redirect-hop" } });
      if (requested === `${url}/redirect-hop`) return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
      return new Response("ok", { status: 200 });
    } });
    expect(calls).not.toContain("https://127.0.0.1/private");
    expect(calls).toContain(`${url}/redirect-hop`);
    expect(findings.find(({ check }) => check === "public-origin")).toMatchObject({ state: "critical", evidence: expect.stringMatching(/redirect/i) });
  });

  it("bounds public and Netlify response bodies before parsing", async () => {
    const oversized = "x".repeat(600_000);
    const findings = await collectSiteHealth({ publicUrl: url, studioUrl: "https://studio.example", now: new Date(checkedAt), netlify: { siteId: "site-1", token: "test-token" }, fetchImpl: async (input) => {
      const requested = String(input);
      if (requested.endsWith("/sitemap.xml") || requested.includes("api.netlify.com")) return new Response(oversized, { status: 200 });
      return new Response("ok", { status: 200 });
    } });
    expect(findings.find(({ check }) => check === "sitemap")).toMatchObject({ state: "critical", evidence: expect.stringMatching(/limit|large/i) });
    expect(findings.find(({ check }) => check === "deployment")).toMatchObject({ state: "unavailable", evidence: expect.stringMatching(/limit|large/i) });
  });

  it("rejects private or non-HTTPS configured public probe origins", async () => {
    await expect(collectSiteHealth({ publicUrl: "http://127.0.0.1:3000" })).rejects.toThrow(/public https origin/i);
  });
});
