import Image from "next/image";
import Link from "next/link";

import { ArticleMeta } from "@/components/articles/article-meta";
import { CategoryLabel } from "@/components/articles/category-label";
import type { ArticleSummary } from "@/lib/content/schema";

export function LeadStory({
  article,
  supportingArticles = [],
}: {
  article: ArticleSummary;
  supportingArticles?: readonly ArticleSummary[];
}) {
  return (
    <section className="grid border-y-2 border-ink lg:grid-cols-[minmax(0,2fr)_minmax(19rem,0.8fr)]" aria-label="Top stories">
      <article className="py-6 lg:pr-8">
        <div className="relative aspect-[16/9] overflow-hidden bg-panel">
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            loading="eager"
            sizes="(max-width: 1023px) 100vw, 68vw"
            className="object-cover transition-transform duration-500 hover:scale-[1.015]"
          />
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.35fr)] md:items-start">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-muted">
              Top story
            </p>
            <CategoryLabel category={article.category} />
            <h2 id="top-story-heading" className="mt-4 max-w-4xl font-serif text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl xl:text-6xl">
              <Link
                href={`/article/${article.slug}`}
                className="decoration-4 decoration-signal underline-offset-8 hover:underline"
              >
                {article.title}
              </Link>
            </h2>
          </div>
          <div className="border-l-2 border-signal pl-4">
            <p className="text-sm leading-6 text-muted">{article.excerpt}</p>
            <div className="mt-4">
              <ArticleMeta
                author={article.author}
                date={article.date}
                readTime={article.readTime}
              />
            </div>
          </div>
        </div>
      </article>

      <aside className="border-t-2 border-ink py-6 lg:border-l lg:border-t-0 lg:pl-8" aria-labelledby="latest-signals-heading">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">
          Across the desks
        </p>
        <h2 id="latest-signals-heading" className="mt-2 font-serif text-3xl font-semibold tracking-[-0.035em]">
          Latest signals
        </h2>
        <ol className="mt-5">
          {supportingArticles.map((supportingArticle) => (
            <li className="border-t border-line py-5 first:border-t-2 first:border-ink" key={supportingArticle.slug}>
              <CategoryLabel category={supportingArticle.category} />
              <h3 className="mt-3 font-serif text-xl font-semibold leading-tight tracking-[-0.02em]">
                <Link className="underline-offset-4 hover:underline" href={`/article/${supportingArticle.slug}`}>
                  {supportingArticle.title}
                </Link>
              </h3>
              <p className="mt-2 text-xs text-muted">{supportingArticle.readTime} min read</p>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
