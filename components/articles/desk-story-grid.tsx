import Image from "next/image";
import Link from "next/link";

import { getCategory } from "@/lib/config/categories";
import type { ArticleSummary } from "@/lib/content/schema";

export function DeskStoryGrid({
  articles,
  compact = false,
}: {
  articles: readonly ArticleSummary[];
  compact?: boolean;
}) {
  if (articles.length === 0) {
    return null;
  }

  const stories = (
    <div
      aria-label={compact ? "Across the desks" : undefined}
      className={`grid border-l border-line sm:grid-cols-2 ${
        compact ? "lg:grid-cols-4" : "xl:grid-cols-3"
      }`}
    >
        {articles.map((article) => {
          const category = getCategory(article.category);

          return (
            <article
              className={`group border-b border-r border-line bg-canvas ${
                compact ? "p-3 sm:p-4" : "p-4 sm:p-5"
              }`}
              key={article.slug}
            >
              <div className="relative aspect-[16/8.6] overflow-hidden bg-panel">
                <Image
                  alt={article.title}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                  fill
                  sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 33vw"
                  src={article.coverImage}
                />
              </div>
              <div className="pt-4">
                <Link
                  className="editorial-category"
                  data-accent={category.accent}
                  href={`/category/${article.category}`}
                >
                  {category.label}
                </Link>
                <h3
                  className={`mt-2 font-serif font-semibold leading-[1.02] tracking-[-0.035em] ${
                    compact ? "text-lg xl:text-xl" : "text-2xl"
                  }`}
                >
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={`/article/${article.slug}`}
                  >
                    {article.title}
                  </Link>
                </h3>
                <span aria-hidden="true" className="mt-4 block text-2xl leading-none text-cobalt">
                  →
                </span>
              </div>
            </article>
          );
        })}
    </div>
  );

  if (compact) {
    return stories;
  }

  return (
    <section aria-labelledby="desk-stories-heading" className="mt-4">
      <div className="flex items-end justify-between gap-5 border-b-2 border-ink pb-3">
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-muted">
            Global newsroom
          </p>
          <h2
            className="mt-1 font-serif text-3xl font-semibold tracking-[-0.04em] sm:text-4xl"
            id="desk-stories-heading"
          >
            Across the desks
          </h2>
        </div>
        <p className="hidden max-w-sm text-right text-xs leading-5 text-muted md:block">
          Six beats. One global edition. Every story reviewed before publication.
        </p>
      </div>

      {stories}
    </section>
  );
}
