import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SearchExperience } from "@/components/search/search-experience";
import { buildSearchIndex } from "@/lib/content/search";
import type { ArticleSummary } from "@/lib/content/schema";

const article: ArticleSummary = {
  title: "How Electoral Systems Shape Coalitions",
  slug: "electoral-systems",
  date: "2026-08-21",
  category: "politics",
  tags: ["Global Policy", "Elections"],
  author: "Renée Müller",
  excerpt: "Voting rules influence strategy and representation.",
  coverImage: "/images/articles/politics.svg",
  readTime: 7,
  sourceName: "International IDEA",
  sourceUrl: "https://www.idea.int/data-tools/data/electoral-system-design-database",
};

describe("SearchExperience", () => {
  it("searches title, tags, author, and category without case or accents", async () => {
    const user = userEvent.setup();
    render(<SearchExperience articles={buildSearchIndex([article])} />);

    await user.type(screen.getByRole("searchbox"), "RENEE GLOBAL POLICY");

    expect(
      await screen.findByRole("link", { name: /electoral systems/i }),
    ).toHaveAttribute("href", "/article/electoral-systems");
  });

  it("announces a truthful empty result", async () => {
    const user = userEvent.setup();
    render(<SearchExperience articles={buildSearchIndex([article])} />);

    await user.type(screen.getByRole("searchbox"), "semiconductors");

    expect(await screen.findByRole("status")).toHaveTextContent(
      /no stories matched/i,
    );
  });
});
