import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeskStoryGrid } from "@/components/articles/desk-story-grid";
import type { ArticleSummary } from "@/lib/content/schema";

const stories: ArticleSummary[] = [
  {
    title: "Ideas Travel Further Than Borders",
    slug: "ideas-travel",
    date: "2026-08-27",
    category: "anime",
    tags: ["Culture"],
    author: "OmniLede Editorial",
    excerpt: "Global audiences build culture together.",
    coverImage: "/images/articles/anime.svg",
    readTime: 6,
    sourceName: "Example",
    sourceUrl: "https://example.com/anime",
  },
  {
    title: "What Comes Next for Global Leadership",
    slug: "global-leadership",
    date: "2026-08-26",
    category: "politics",
    tags: ["Politics"],
    author: "OmniLede Editorial",
    excerpt: "Institutions shape the choices leaders can make.",
    coverImage: "/images/articles/politics.svg",
    readTime: 7,
    sourceName: "Example",
    sourceUrl: "https://example.com/politics",
  },
];

describe("DeskStoryGrid", () => {
  it("makes every desk story visual and directly readable", () => {
    render(<DeskStoryGrid articles={stories} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Across the desks" }),
    ).toBeVisible();

    for (const story of stories) {
      expect(screen.getByRole("img", { name: story.title })).toBeVisible();
      expect(screen.getByRole("link", { name: story.title })).toHaveAttribute(
        "href",
        `/article/${story.slug}`,
      );
    }
  });

  it("can join a lead package as a compact row without a duplicate section heading", () => {
    render(<DeskStoryGrid articles={stories} compact />);

    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    for (const story of stories) {
      expect(screen.getByRole("link", { name: story.title })).toHaveAttribute(
        "href",
        `/article/${story.slug}`,
      );
    }
  });
});
