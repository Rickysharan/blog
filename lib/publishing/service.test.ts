import { describe, expect, test, vi } from "vitest";

import {
  BoundedPublicationRateLimiter,
  parsePublicationEnvironment,
  publishPublication,
  type PublicationServiceDependencies,
} from "./service";

const publicationId = "10000000-0000-4000-8000-000000000001";
const basePublication = {
  publicationId,
  submissionId: "10000000-0000-4000-8000-000000000002",
  submissionVersion: 1,
  title: "A contributor report",
  slug: "contributor-report",
  date: "2026-08-28",
  category: "finance",
  tags: ["markets"],
  contributorId: "10000000-0000-4000-8000-000000000003",
  contributorName: "Test Contributor",
  excerpt: "A bounded report.",
  coverImage: "https://images.example/published/10000000-0000-4000-8000-000000000001.webp",
  readTime: 3,
  sourceName: "Example Source",
  sourceUrl: "https://example.com/source",
  region: "europe",
  language: "en-GB",
  contentDocument: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello." }] }],
  },
  guidelinesVersion: "2026-08-28",
} as const;

function dependencies(overrides: Partial<PublicationServiceDependencies> = {}): PublicationServiceDependencies {
  const publish = vi.fn().mockResolvedValue({
    commitSha: "a".repeat(40),
    commitUrl: "https://github.com/owner/repo/commit/" + "a".repeat(40),
    articlePath: "content/articles/finance/contributor-report.mdx",
    replayed: false,
  });
  return {
    publishedImageOrigin: "https://images.example/published",
    siteOrigin: "https://omnilede.example",
    nonceStore: { claim: vi.fn().mockResolvedValue({ status: "claimed" }) },
    articleRepository: {
      publish,
    },
    ...overrides,
  };
}

const nonce = "10000000-0000-4000-8000-000000000004";

describe("publishPublication", () => {
  test("validates and renders before invoking GitHub", async () => {
    const deps = dependencies();
    const result = await publishPublication({ publication: basePublication, nonce, dependencies: deps });

    expect(result).toMatchObject({ publicationId, replayed: false, articlePath: "content/articles/finance/contributor-report.mdx" });
    expect(deps.nonceStore.claim).toHaveBeenCalledOnce();
    expect(deps.articleRepository.publish).toHaveBeenCalledOnce();
    expect(vi.mocked(deps.articleRepository.publish).mock.calls[0][0].mdx).toContain("Source: [Example Source]");
  });

  test("does not call GitHub for schema or renderer validation failures", async () => {
    const deps = dependencies();
    await expect(publishPublication({ publication: { ...basePublication, category: "../../escape" }, nonce, dependencies: deps })).rejects.toMatchObject({ code: "invalid_publication" });
    expect(deps.nonceStore.claim).not.toHaveBeenCalled();
    expect(deps.articleRepository.publish).not.toHaveBeenCalled();
  });

  test("parses and verifies injected renderer output before claiming a nonce", async () => {
    const deps = dependencies({ renderer: vi.fn(() => "---\nslug: wrong\n---\nmalformed") });
    await expect(publishPublication({ publication: basePublication, nonce, dependencies: deps })).rejects.toMatchObject({ code: "invalid_publication" });
    expect(deps.nonceStore.claim).not.toHaveBeenCalled();
    expect(deps.articleRepository.publish).not.toHaveBeenCalled();
  });

  test("maps nonce conflict and unavailable states", async () => {
    await expect(publishPublication({ publication: basePublication, nonce, dependencies: dependencies({ nonceStore: { claim: vi.fn().mockResolvedValue({ status: "conflict" }) } }) })).rejects.toMatchObject({ code: "nonce_conflict" });
    await expect(publishPublication({ publication: basePublication, nonce, dependencies: dependencies({ nonceStore: { claim: vi.fn().mockResolvedValue({ status: "unavailable" }) } }) })).rejects.toMatchObject({ code: "service_unavailable" });
  });

  test("reconciles an identical nonce replay without creating a second commit", async () => {
    const deps = dependencies({ nonceStore: { claim: vi.fn().mockResolvedValue({ status: "replayed" }) } });
    const result = await publishPublication({ publication: basePublication, nonce, dependencies: deps });
    expect(result.replayed).toBe(true);
    expect(deps.articleRepository.publish).toHaveBeenCalledOnce();
  });

  test("exhausts the fixed-audience limiter and resets after expiry", () => {
    const limiter = new BoundedPublicationRateLimiter({ maxRequests: 2, windowMs: 100 });
    expect(limiter.allow("attacker-ip", 1_000)).toBe(true);
    expect(limiter.allow("another-ip", 1_000)).toBe(true);
    expect(limiter.allow("another-ip", 1_000)).toBe(false);
    expect(limiter.allow("another-ip", 1_100)).toBe(true);
  });

  test("allows only the documented local site example over HTTP", () => {
    const valid = {
      CONTRIBUTOR_PUBLISH_HMAC_SECRET: "a".repeat(32),
      GITHUB_PUBLISH_TOKEN: "token",
      GITHUB_REPOSITORY: "owner/repository",
      GITHUB_BRANCH: "main",
      PUBLISHED_IMAGE_ORIGIN: "https://images.example/published",
      CONTRIBUTOR_APP_ORIGIN: "https://contributors.example",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_key",
    };
    expect(parsePublicationEnvironment(valid).NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(() => parsePublicationEnvironment({ ...valid, NEXT_PUBLIC_SITE_URL: "http://omnilede.example" })).toThrow();
    expect(() => parsePublicationEnvironment({ ...valid, CONTRIBUTOR_APP_ORIGIN: "http://localhost:3000" })).toThrow();
  });
});
