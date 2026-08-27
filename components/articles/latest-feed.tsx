import { ArticleListItem } from "@/components/articles/article-list-item";
import type { ArticleSummary } from "@/lib/content/schema";

export function LatestFeed({ articles }: { articles: readonly ArticleSummary[] }) {
  return (
    <section aria-labelledby="latest-heading" className="[content-visibility:auto]">
      <div className="grid gap-4 border-b-2 border-ink pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">
            Newsroom wire
          </p>
          <h2
            id="latest-heading"
            className="mt-1 font-serif text-4xl font-semibold tracking-[-0.045em] sm:text-5xl"
          >
            Latest reporting
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-muted sm:text-right">
          Freshly published explainers from every OmniLede desk.
        </p>
      </div>
      {articles.map((article) => (
        <ArticleListItem key={article.slug} article={article} />
      ))}
    </section>
  );
}
