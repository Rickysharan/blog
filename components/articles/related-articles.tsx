import { ArticleCard } from "@/components/articles/article-card";
import type { ArticleSummary } from "@/lib/content/schema";

export function RelatedArticles({ articles }: { articles: readonly ArticleSummary[] }) {
  if (articles.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="related-heading" className="mt-16">
      <h2
        id="related-heading"
        className="border-b-2 border-ink pb-3 font-serif text-3xl font-semibold tracking-[-0.03em]"
      >
        Related reading
      </h2>
      <div className="mt-6 grid gap-8 md:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>
    </section>
  );
}
