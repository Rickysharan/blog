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
    <section aria-labelledby={`${category}-heading`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2
            id={`${category}-heading`}
            className="font-serif text-3xl font-semibold tracking-[-0.04em]"
          >
            {definition.label}
          </h2>
          <p className="mt-2 max-w-xs text-xs leading-5 text-muted">
            {definition.description}
          </p>
        </div>
        <Link
          href={`/category/${category}`}
          className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.14em] underline decoration-signal decoration-2 underline-offset-4"
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
