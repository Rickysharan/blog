import { CATEGORIES, type CategorySlug } from "@/lib/config/categories";
import type { ArticleSummary } from "@/lib/content/schema";

const SAFE_TOPIC = /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/;
const MAX_QUALIFYING_TAGS = 8;

export type QualifiedTopic = {
  slug: string;
  label: string;
  summary: string;
  canonicalPath: `/topic/${string}`;
  articles: ArticleSummary[];
  categories: CategorySlug[];
};

function normalizedTag(value: string): { key: string; slug: string } | null {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || !SAFE_TOPIC.test(trimmed)) return null;
  const key = trimmed.toLocaleLowerCase("en");
  const slug = key.replaceAll(" ", "-");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  return { key, slug };
}

function displayLabel(key: string): string {
  return key.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function getQualifiedTopics(
  articles: readonly ArticleSummary[],
  minimumArticles = 3,
): QualifiedTopic[] {
  const threshold = Number.isSafeInteger(minimumArticles) && minimumArticles >= 3
    ? minimumArticles
    : 3;
  const grouped = new Map<string, { slug: string; articles: Map<string, ArticleSummary> }>();
  const ambiguous = new Set<string>();

  for (const article of articles) {
    if (!article.excerpt.trim() || article.tags.length > MAX_QUALIFYING_TAGS) continue;
    const seen = new Set<string>();
    for (const tag of article.tags) {
      const normalized = normalizedTag(tag);
      if (!normalized) continue;
      if (seen.has(normalized.key)) {
        ambiguous.add(normalized.key);
        continue;
      }
      seen.add(normalized.key);
      const group = grouped.get(normalized.key) ?? {
        slug: normalized.slug,
        articles: new Map<string, ArticleSummary>(),
      };
      group.articles.set(article.slug, article);
      grouped.set(normalized.key, group);
    }
  }

  const categoryOrder = new Map(CATEGORIES.map(({ slug }, index) => [slug, index]));
  return [...grouped.entries()]
    .filter(([key, group]) => !ambiguous.has(key) && group.articles.size >= threshold)
    .map(([key, group]) => {
      const topicArticles = [...group.articles.values()].sort(
        (left, right) => right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug),
      );
      const categories = [...new Set(topicArticles.map(({ category }) => category))].sort(
        (left, right) => (categoryOrder.get(left) ?? 99) - (categoryOrder.get(right) ?? 99),
      );
      const label = displayLabel(key);
      const categoryNames = categories
        .map((slug) => CATEGORIES.find((category) => category.slug === slug)?.label ?? slug)
        .join(", ");
      return {
        slug: group.slug,
        label,
        summary: `Explore OmniLede's independently reviewed ${label} coverage, with context from ${topicArticles.length} articles across ${categoryNames}.`,
        canonicalPath: `/topic/${group.slug}` as const,
        articles: topicArticles,
        categories,
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

