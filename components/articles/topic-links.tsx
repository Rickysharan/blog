import Link from "next/link";

import type { ArticleSummary } from "@/lib/content/schema";
import type { QualifiedTopic } from "@/lib/content/topics";
import { CATEGORIES } from "@/lib/config/categories";

export function TopicLinks({
  article,
  topics,
}: {
  article: ArticleSummary;
  topics: readonly QualifiedTopic[];
}) {
  const related = topics.filter((topic) => topic.articles.some(({ slug }) => slug === article.slug));
  const relatedCategories = [...new Set(related.flatMap(({ categories }) => categories))]
    .filter((category) => category !== article.category);
  if (related.length === 0 && relatedCategories.length === 0) return null;

  return (
    <nav aria-label="Related topics and desks" className="mt-10 border-t-2 border-ink pt-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">Continue exploring</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {related.map((topic) => (
          <Link className="border border-ink px-3 py-2 text-sm font-semibold hover:border-signal" href={topic.canonicalPath} key={topic.slug}>
            {topic.label}
          </Link>
        ))}
        {relatedCategories.map((slug) => {
          const category = CATEGORIES.find((value) => value.slug === slug);
          return category ? (
            <Link className="border border-ink px-3 py-2 text-sm hover:border-signal" href={`/category/${slug}`} key={slug}>
              {category.label}
            </Link>
          ) : null;
        })}
      </div>
    </nav>
  );
}
