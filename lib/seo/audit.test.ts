import { describe, expect, it } from "vitest";

import { auditPublicSite, siteFindingsToSeoWarnings } from "./audit";

const origin = "https://news.example";
const organization = JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", "@id": `${origin}/#organization`, name: "OmniLede Editorial", url: origin });
const articleLd = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle", headline: "Useful story", description: "A useful description", datePublished: "2026-10-01T00:00:00.000Z", dateModified: "2026-10-01T00:00:00.000Z", image: [`${origin}/image.jpg`], author: { "@type": "Organization", name: "OmniLede Editorial" }, publisher: { "@type": "Organization", "@id": `${origin}/#organization`, name: "OmniLede Editorial", url: origin }, mainEntityOfPage: `${origin}/article/story`, url: `${origin}/article/story` });
const breadcrumbLd = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` }, { "@type": "ListItem", position: 2, name: "Story", item: `${origin}/article/story` }] });

function html({ canonical, title = "Useful story | OmniLede", description = "A useful and distinct page description.", body = `<time datetime=\"2026-10-01\">1 October 2026</time><a href=\"/category/anime\">Anime</a><img src=\"/image.jpg\" alt=\"Story scene\">`, jsonLd = articleLd }: { canonical: string; title?: string; description?: string; body?: string; jsonLd?: string }) {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="index,follow"><link rel="canonical" href="${canonical}"><script type="application/ld+json">${organization}</script><script type="application/ld+json">${jsonLd}</script><script type="application/ld+json">${breadcrumbLd}</script></head><body>${body}</body></html>`;
}

function fixtureFetch(overrides: Record<string, Response> = {}) {
  const responses: Record<string, Response> = {
    [`${origin}/robots.txt`]: new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml`, { status: 200 }),
    [`${origin}/sitemap.xml`]: new Response(`<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/article/story</loc></url><url><loc>${origin}/category/anime</loc></url></urlset>`, { status: 200 }),
    [`${origin}/`]: new Response(html({ canonical: `${origin}/`, title: "OmniLede", description: "Independent global reporting across six desks.", jsonLd: organization }), { status: 200 }),
    [`${origin}/article/story`]: new Response(html({ canonical: `${origin}/article/story` }), { status: 200 }),
    [`${origin}/category/anime`]: new Response(html({ canonical: `${origin}/category/anime`, title: "Anime | OmniLede", description: "Original anime reporting and analysis.", jsonLd: organization }), { status: 200 }),
    ...overrides,
  };
  const calls: Array<{ url: string; method: string }> = [];
  return {
    calls,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, method: init?.method ?? "GET" });
      return responses[url] ?? new Response("missing", { status: 404 });
    },
  };
}

describe("auditPublicSite", () => {
  it("returns evidence-backed pass findings for canonical metadata, robots, sitemap, alt text, links, and structured data", async () => {
    const fixture = fixtureFetch();
    const findings = await auditPublicSite(origin, { fetchImpl: fixture.fetch, now: new Date("2026-10-04T12:00:00Z") });
    expect(new Set(findings.map(({ check }) => check))).toEqual(new Set(["robots", "sitemap", "canonical", "metadata", "image-alt", "internal-links", "structured-data"]));
    expect(findings.every(({ state, evidence, affectedUrl, recoveryAction, checkedAt }) => state === "pass" && evidence && affectedUrl.startsWith(origin) && recoveryAction && checkedAt === "2026-10-04T12:00:00.000Z")).toBe(true);
    expect(fixture.calls.every(({ method }) => method === "GET")).toBe(true);
    expect(fixture.calls.length).toBeLessThanOrEqual(28);
  });

  it("reports actionable page-specific evidence and maps only warnings to stable Today suggestions", async () => {
    const broken = html({ canonical: `${origin}/wrong`, title: "", description: "", body: `<a href="/missing">Missing</a><img src="/image.jpg">`, jsonLd: "{}" });
    const fixture = fixtureFetch({ [`${origin}/article/story`]: new Response(broken, { status: 200 }) });
    const findings = await auditPublicSite(origin, { fetchImpl: fixture.fetch, now: new Date("2026-10-04T12:00:00Z") });
    const warnings = findings.filter(({ state }) => state !== "pass");
    expect(warnings.map(({ check }) => check)).toEqual(expect.arrayContaining(["canonical", "metadata", "image-alt", "internal-links", "structured-data"]));
    expect(warnings.every(({ evidence, recoveryAction }) => evidence.length > 0 && recoveryAction.length > 0)).toBe(true);
    const first = siteFindingsToSeoWarnings(findings);
    expect(siteFindingsToSeoWarnings([...findings].reverse())).toEqual(first);
    expect(first.every(({ code }) => code.startsWith("site-audit:"))).toBe(true);
    expect(first.some(({ url }) => url === `${origin}/article/story`)).toBe(true);
  });

  it("blocks unsafe origins, cross-origin redirects, oversized bodies, and sitemap crawl expansion", async () => {
    await expect(auditPublicSite("http://127.0.0.1:3000", { fetchImpl: fixtureFetch().fetch })).rejects.toThrow(/public HTTPS origin/i);
    const calls: string[] = [];
    const redirecting = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
    };
    const findings = await auditPublicSite(origin, { fetchImpl: redirecting });
    expect(calls).not.toContain("https://127.0.0.1/private");
    expect(findings.some(({ state, evidence }) => state === "error" && /redirect/i.test(evidence))).toBe(true);

    const oversized = fixtureFetch({ [`${origin}/robots.txt`]: new Response("x".repeat(600_000), { status: 200 }) });
    const oversizedFindings = await auditPublicSite(origin, { fetchImpl: oversized.fetch });
    expect(oversizedFindings.some(({ check, evidence }) => check === "robots" && /size/i.test(evidence))).toBe(true);
  });

  it("rejects private, mixed, and mapped DNS answers and pins one validated resolution", async () => {
    const fixture = fixtureFetch();
    const requestImpl = async (url: URL, address: { address: string }) => {
      expect(address.address).toBe("93.184.216.34");
      return fixture.fetch(url);
    };
    await expect(auditPublicSite(origin, {
      resolveHostname: async () => [{ address: "10.0.0.2", family: 4 }],
      requestImpl,
    })).rejects.toThrow(/public addresses/i);
    await expect(auditPublicSite(origin, {
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }],
      requestImpl,
    })).rejects.toThrow(/public addresses/i);
    await expect(auditPublicSite(origin, {
      resolveHostname: async () => [{ address: "::ffff:127.0.0.1", family: 6 }],
      requestImpl,
    })).rejects.toThrow(/public addresses/i);

    let resolutions = 0;
    const findings = await auditPublicSite(origin, {
      resolveHostname: async () => {
        resolutions += 1;
        return resolutions === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
      },
      requestImpl,
    });
    expect(resolutions).toBe(1);
    expect(findings.every(({ state }) => state === "pass")).toBe(true);
  });

  it("rejects nonempty structured data that disagrees with the canonical visible page", async () => {
    const wrong = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: "Useful story",
      description: "A useful description",
      datePublished: "2026-10-02T00:00:00.000Z",
      dateModified: "2026-10-01T00:00:00.000Z",
      image: ["https://other.example/image.jpg"],
      publisher: { "@type": "Organization", "@id": `${origin}/#wrong`, name: "Wrong", url: origin },
      mainEntityOfPage: `${origin}/article/other`,
      url: `${origin}/article/other`,
    });
    const fixture = fixtureFetch({ [`${origin}/article/story`]: new Response(html({ canonical: `${origin}/article/story`, jsonLd: wrong }), { status: 200 }) });
    const findings = await auditPublicSite(origin, { fetchImpl: fixture.fetch });
    expect(findings.find(({ check }) => check === "structured-data")?.state).toBe("warning");
  });
});
