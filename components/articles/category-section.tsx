import Link from "next/link";

import { ArticleCard } from "@/components/articles/article-card";
import { getCategory, type CategorySlug } from "@/lib/config/categories";
import type { ArticleSummary } from "@/lib/content/schema";

export function CategorySection({
  category,
  article,
}: {
  category: CategorySlug;
  article: ArticleSummary | null;
}) {
  const definition = getCategory(category);

  return (
    <section aria-labelledby={`${category}-heading`} className="[content-visibility:auto]">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Desk
          </p>
          <h2
            id={`${category}-heading`}
            className="mt-1 font-serif text-3xl font-semibold tracking-[-0.03em]"
          >
            {definition.label}
          </h2>
        </div>
        <Link
          href={`/category/${category}`}
          className="text-sm font-semibold underline decoration-line underline-offset-4 hover:decoration-current"
        >
          View desk
        </Link>
      </div>
      {article ? (
        <ArticleCard article={article} />
      ) : (
        <p className="border-t border-line py-8 text-sm text-muted">
          No published stories in this desk yet.
        </p>
      )}
    </section>
  );
}
