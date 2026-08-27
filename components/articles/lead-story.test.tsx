import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LeadStory } from "@/components/articles/lead-story";
import type { ArticleSummary } from "@/lib/content/schema";

const lead: ArticleSummary = {
  title: "How Simulcast Calendars Connect Global Anime Audiences",
  slug: "simulcast-calendars",
  date: "2026-08-23",
  category: "anime",
  tags: ["Streaming"],
  author: "OmniLede Editorial",
  excerpt: "A practical guide to the scheduling work behind a worldwide release.",
  coverImage: "/images/articles/anime.svg",
  readTime: 6,
  sourceName: "Anime News Network",
  sourceUrl: "https://www.animenewsnetwork.com/",
};

const supporting: ArticleSummary[] = [
  {
    ...lead,
    title: "Why Global Film Performance Needs More Than One Box Office Number",
    slug: "global-film-performance",
    category: "movies",
    coverImage: "/images/articles/movies.svg",
    sourceName: "Variety",
    sourceUrl: "https://variety.com/",
  },
  {
    ...lead,
    title: "How to Read Global Economic Forecasts Without Treating Them as Certainty",
    slug: "global-economic-forecasts",
    category: "finance",
    coverImage: "/images/articles/finance.svg",
    sourceName: "Reuters",
    sourceUrl: "https://www.reuters.com/",
  },
];

describe("LeadStory", () => {
  it("pairs the top story with a latest-signals rail", () => {
    render(<LeadStory article={lead} supportingArticles={supporting} />);

    expect(screen.getByText("Top story")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: lead.title }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Latest signals" }),
    ).toBeVisible();
    for (const article of supporting) {
      expect(screen.getByRole("link", { name: article.title })).toHaveAttribute(
        "href",
        `/article/${article.slug}`,
      );
    }
  });
});
