import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArticleCard } from "@/components/articles/article-card";
import type { ArticleSummary } from "@/lib/content/schema";

const article: ArticleSummary = {
  title: "How Electoral Systems Shape Coalitions",
  slug: "electoral-systems",
  date: "2026-08-21",
  category: "politics",
  tags: ["Elections"],
  author: "OmniLede Editorial",
  excerpt: "Voting rules influence strategy and representation.",
  coverImage: "/images/articles/politics.svg",
  readTime: 7,
  sourceName: "International IDEA",
  sourceUrl: "https://www.idea.int/data-tools/data/electoral-system-design-database",
};

describe("ArticleCard", () => {
  it("renders a desk label and responsive image metadata", () => {
    render(<ArticleCard article={article} />);

    expect(screen.getByText("Politics")).toBeVisible();
    expect(screen.getByRole("img", { name: article.title })).toHaveAttribute(
      "data-nimg",
      "fill",
    );
    expect(
      screen.getByRole("link", { name: `Read ${article.title}` }),
    ).toHaveAttribute("href", "/article/electoral-systems");
  });
});
