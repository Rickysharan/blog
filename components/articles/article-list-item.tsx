import Link from "next/link";

import { ArticleMeta } from "@/components/articles/article-meta";
import { CategoryLabel } from "@/components/articles/category-label";
import type { ArticleSummary } from "@/lib/content/schema";

export function ArticleListItem({ article }: { article: ArticleSummary }) {
  return (
    <article className="grid gap-3 border-t border-line py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8">
      <div>
        <CategoryLabel category={article.category} />
        <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight tracking-[-0.02em]">
          <Link
            href={`/article/${article.slug}`}
            className="underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          {article.excerpt}
        </p>
      </div>
      <ArticleMeta
        author={article.author}
        date={article.date}
        readTime={article.readTime}
      />
    </article>
  );
}
