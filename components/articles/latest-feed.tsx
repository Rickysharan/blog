import { ArticleListItem } from "@/components/articles/article-list-item";
import type { ArticleSummary } from "@/lib/content/schema";

export function LatestFeed({ articles }: { articles: readonly ArticleSummary[] }) {
  return (
    <section aria-labelledby="latest-heading" className="[content-visibility:auto]">
      <div className="border-b-2 border-ink pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Across the newsroom
        </p>
        <h2
          id="latest-heading"
          className="mt-1 font-serif text-4xl font-semibold tracking-[-0.035em]"
        >
          Latest
        </h2>
      </div>
      {articles.map((article) => (
        <ArticleListItem key={article.slug} article={article} />
      ))}
    </section>
  );
}
