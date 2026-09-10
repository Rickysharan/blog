import { describe, expect, it } from "vitest";

import type { ArticleSummary } from "@/lib/content/schema";
import {
  clearExplicitPreference,
  orderArticlesForSelection,
  readExplicitPreference,
  resolveRegionSelection,
  saveExplicitPreference,
} from "@/lib/region/preferences";

const articles: ArticleSummary[] = [
  {
    title: "Global lead",
    slug: "global-lead",
    date: "2026-09-02",
    category: "politics",
    tags: ["global"],
    author: "OmniLede Editorial",
    excerpt: "Global context.",
    coverImage: "/images/articles/politics.svg",
    readTime: 3,
    sourceName: "Global Source",
    sourceUrl: "https://example.com/global",
    region: "global",
    language: "en",
  },
  {
    title: "Asia briefing",
    slug: "asia-briefing",
    date: "2026-09-01",
    category: "politics",
    tags: ["asia"],
    author: "OmniLede Editorial",
    excerpt: "Asia context.",
    coverImage: "/images/articles/politics.svg",
    readTime: 3,
    sourceName: "Asia Source",
    sourceUrl: "https://example.com/asia",
    region: "asia",
    language: "en-IN",
  },
  {
    title: "Europe briefing",
    slug: "europe-briefing",
    date: "2026-08-31",
    category: "politics",
    tags: ["europe"],
    author: "OmniLede Editorial",
    excerpt: "Europe context.",
    coverImage: "/images/articles/politics.svg",
    readTime: 3,
    sourceName: "Europe Source",
    sourceUrl: "https://example.com/europe",
    region: "europe",
    language: "en-GB",
  },
  {
    title: "Europe francophone",
    slug: "europe-francophone",
    date: "2026-08-30",
    category: "politics",
    tags: ["europe"],
    author: "OmniLede Editorial",
    excerpt: "Europe context in French.",
    coverImage: "/images/articles/politics.svg",
    readTime: 3,
    sourceName: "Europe Source",
    sourceUrl: "https://example.com/europe-fr",
    region: "europe",
    language: "fr",
  },
];

describe("regional preferences", () => {
  it("defaults to Global and preserves editorial order", () => {
    const selection = resolveRegionSelection(null, null);

    expect(selection).toEqual({ mode: "global", region: "global", language: null });
    expect(orderArticlesForSelection(articles, selection).map(({ slug }) => slug)).toEqual(
      articles.map(({ slug }) => slug),
    );
  });

  it("uses detection only as a suggestion and never persists it", () => {
    const selection = resolveRegionSelection(null, {
      countryCode: "GB",
      region: "europe",
      source: "netlify",
    });

    expect(selection).toEqual({ mode: "suggested", region: "europe", language: null });
    expect(localStorage.getItem("omnilede-region-preference")).toBeNull();
  });

  it("persists, reads and clears an explicit region and language choice", () => {
    saveExplicitPreference(localStorage, { region: "asia", language: "en-IN" });

    expect(readExplicitPreference(localStorage)).toEqual({ region: "asia", language: "en-IN" });
    expect(resolveRegionSelection(readExplicitPreference(localStorage), null)).toEqual({
      mode: "choice",
      region: "asia",
      language: "en-IN",
    });

    clearExplicitPreference(localStorage);
    expect(readExplicitPreference(localStorage)).toBeNull();
  });

  it("ignores corrupted or unsupported stored values", () => {
    localStorage.setItem("omnilede-region-preference", "not-json");
    expect(readExplicitPreference(localStorage)).toBeNull();

    localStorage.setItem(
      "omnilede-region-preference",
      JSON.stringify({ region: "antarctica", language: "en-12" }),
    );
    expect(readExplicitPreference(localStorage)).toBeNull();
  });

  it("ranks an exact language match, then region, then Global without removing stories", () => {
    const ordered = orderArticlesForSelection(articles, {
      mode: "choice",
      region: "europe",
      language: "en-GB",
    });

    expect(ordered.map(({ slug }) => slug)).toEqual([
      "europe-briefing",
      "europe-francophone",
      "global-lead",
      "asia-briefing",
    ]);
    expect(ordered).toHaveLength(articles.length);
  });
});
