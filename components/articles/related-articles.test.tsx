import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RelatedArticles } from "./related-articles";
import type { ArticleSummary } from "@/lib/content/schema";

const article: ArticleSummary = {
  title: "A useful related story", slug: "useful-related-story", date: "2026-10-08",
  category: "movies", tags: ["Cinema"], author: "Ricky Sharan",
  excerpt: "A useful related summary.", coverImage: "/images/articles/movies.svg", readTime: 4,
  sourceName: "Example", sourceUrl: "https://example.com/story",
};

describe("RelatedArticles", () => {
  it("labels recommendations You may also like and supports four wide cards", () => {
    render(<RelatedArticles articles={[article]} />);
    const heading = screen.getByRole("heading", { name: "You may also like" });
    expect(heading.nextElementSibling).toHaveClass("md:grid-cols-2", "xl:grid-cols-4");
    expect(screen.getByRole("link", { name: `Read ${article.title}` })).toBeInTheDocument();
  });

  it("renders nothing when there are no other articles", () => {
    const { container } = render(<RelatedArticles articles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
