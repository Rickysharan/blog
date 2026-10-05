import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const articles = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NOT_FOUND"); }));
vi.mock("@/lib/content/articles", () => ({ getAllArticles: articles }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <div aria-label={alt} role="img" /> }));

import TopicPage, { generateMetadata, generateStaticParams } from "./page";

const records = ["one", "two", "three"].map((slug, index) => ({
  title: `Streaming story ${index + 1}`, slug, date: `2026-10-0${3 - index}`, category: index === 2 ? "movies" as const : "anime" as const,
  tags: [index === 1 ? "streaming" : "Streaming"], author: "OmniLede Editorial", excerpt: `Original summary ${index + 1}`,
  coverImage: "/images/story.jpg", readTime: 4, sourceName: "Example", sourceUrl: "https://example.com/source",
}));

beforeEach(() => { vi.clearAllMocks(); articles.mockResolvedValue(records); });

describe("qualified topic page", () => {
  it("prebuilds only qualified hubs with a canonical and original summary", async () => {
    await expect(generateStaticParams()).resolves.toEqual([{ slug: "streaming" }]);
    await expect(generateMetadata({ params: Promise.resolve({ slug: "streaming" }) })).resolves.toMatchObject({
      title: "Streaming",
      description: expect.stringContaining("independently reviewed Streaming coverage"),
      alternates: { canonical: expect.stringMatching(/\/topic\/streaming$/) },
    });
    render(await TopicPage({ params: Promise.resolve({ slug: "streaming" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Streaming" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Read Streaming story/ })).toHaveLength(3);
    const deskNav = screen.getByRole("navigation", { name: "Desks covering this topic" });
    expect(deskNav).toContainElement(screen.getAllByRole("link", { name: "Anime" })[0]!);
    expect(deskNav).toContainElement(screen.getAllByRole("link", { name: "Movies" })[0]!);
  });

  it("returns not found when a topic falls below the threshold", async () => {
    articles.mockResolvedValue(records.slice(0, 2));
    await expect(TopicPage({ params: Promise.resolve({ slug: "streaming" }) })).rejects.toThrow("NOT_FOUND");
  });
});
