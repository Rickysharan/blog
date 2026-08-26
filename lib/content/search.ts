import { getCategory } from "@/lib/config/categories";
import type { ArticleSummary } from "@/lib/content/schema";

export type SearchEntry = ArticleSummary & {
  categoryLabel: string;
  searchText: string;
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSearchIndex(
  articles: readonly ArticleSummary[],
): SearchEntry[] {
  return articles.map((article) => {
    const categoryLabel = getCategory(article.category).label;
    return {
      ...article,
      categoryLabel,
      searchText: normalizeSearchText(
        [
          article.title,
          article.excerpt,
          categoryLabel,
          article.author,
          ...article.tags,
        ].join(" "),
      ),
    };
  });
}

export function searchArticles(
  index: readonly SearchEntry[],
  query: string,
  limit = 50,
): SearchEntry[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const tokens = normalizedQuery.split(" ");
  return index
    .filter(({ searchText }) => tokens.every((token) => searchText.includes(token)))
    .slice(0, Math.max(0, limit));
}
