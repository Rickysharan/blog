import {
  CATEGORY_SLUGS,
  type CategorySlug,
} from "@/lib/config/categories";
import type { ArticleSummary } from "@/lib/content/schema";

export type HomepageStories = {
  lead: ArticleSummary | null;
  categoryStories: Record<CategorySlug, ArticleSummary | null>;
  latest: ArticleSummary[];
};

export function selectHomepageStories(
  articles: readonly ArticleSummary[],
  latestLimit = 8,
): HomepageStories {
  const ordered = [...articles].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
  );
  const lead = ordered[0] ?? null;
  const categoryStories = CATEGORY_SLUGS.reduce(
    (stories, category) => {
      stories[category] =
        ordered.find((article) => article.category === category) ?? null;
      return stories;
    },
    {} as Record<CategorySlug, ArticleSummary | null>,
  );

  return {
    lead,
    categoryStories,
    latest: ordered
      .filter((article) => article.slug !== lead?.slug)
      .slice(0, Math.max(0, latestLimit)),
  };
}
