import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RegionalFeed } from "@/components/region/regional-feed";
import type { ArticleSummary } from "@/lib/content/schema";

const article = (slug: string, region: ArticleSummary["region"]): ArticleSummary => ({
  title: `${region ?? "global"} story`,
  slug,
  date: "2026-09-02",
  category: "politics",
  tags: [region ?? "global"],
  author: "OmniLede Editorial",
  excerpt: "A reviewed story.",
  coverImage: "/images/articles/politics.svg",
  readTime: 3,
  sourceName: "Fixture Source",
  sourceUrl: `https://example.com/${slug}`,
  region,
  language: "en",
});

describe("RegionalFeed", () => {
  it("reorders after hydration without removing Global or other stories", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ countryCode: "GB", region: "europe", source: "netlify" })),
      ),
    );
    render(
      <RegionalFeed
        articles={[
          article("global-story", "global"),
          article("asia-story", "asia"),
          article("europe-story", "europe"),
        ]}
        heading="Latest reporting"
      />,
    );

    expect(await screen.findByText("Showing: Suggested — Europe")).toBeVisible();
    const links = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .filter((href) => href?.startsWith("/article/"));
    expect(links).toEqual([
      "/article/europe-story",
      "/article/global-story",
      "/article/asia-story",
    ]);
  });
});
