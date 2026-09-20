import Image from "next/image";
import Link from "next/link";

import { ArticleMeta } from "@/components/articles/article-meta";
import { DeskStoryGrid } from "@/components/articles/desk-story-grid";
import { getCategory } from "@/lib/config/categories";
import type { ArticleSummary } from "@/lib/content/schema";

function CategoryLink({ article }: { article: ArticleSummary }) {
  const category = getCategory(article.category);

  return (
    <Link
      className="editorial-category"
      data-accent={category.accent}
      href={`/category/${article.category}`}
    >
      {category.label}
    </Link>
  );
}

export function LeadStory({
  article,
  supportingArticles = [],
  deskArticles = [],
}: {
  article: ArticleSummary;
  supportingArticles?: readonly ArticleSummary[];
  deskArticles?: readonly ArticleSummary[];
}) {
  return (
    <section
      aria-label="Top stories"
      className="editorial-front-page grid border-y border-ink xl:grid-cols-[minmax(0,1fr)_22.5rem]"
    >
      <div className="min-w-0">
        <article className="editorial-lead-grid grid overflow-hidden md:grid-cols-[minmax(20rem,0.88fr)_minmax(0,1.12fr)]">
          <div className="editorial-lead-copy flex min-h-[29rem] flex-col px-5 py-8 sm:px-8 sm:py-10 lg:min-h-[35rem] lg:px-10">
            <CategoryLink article={article} />
            <h1 className="editorial-lead-title mt-5 font-serif font-semibold leading-[0.88] tracking-[-0.06em]">
              <Link
                className="decoration-[5px] decoration-signal underline-offset-8 hover:underline"
                href={`/article/${article.slug}`}
              >
                {article.title}
              </Link>
            </h1>
            <p className="mt-6 max-w-xl font-serif text-xl leading-[1.28] text-ink/85 sm:text-2xl">
              {article.excerpt}
            </p>
            <div className="mt-auto pt-8">
              <span aria-hidden="true" className="mb-5 block h-[3px] w-14 bg-signal" />
              <ArticleMeta
                author={article.author}
                date={article.date}
                readTime={article.readTime}
              />
            </div>
          </div>

          <div className="editorial-lead-image relative min-h-[22rem] overflow-hidden bg-panel md:min-h-full">
            <Image
              alt={article.title}
              className="object-cover transition-transform duration-700 hover:scale-[1.015]"
              fetchPriority="high"
              fill
              loading="eager"
              sizes="(max-width: 767px) 100vw, (max-width: 1279px) 62vw, 48vw"
              src={article.coverImage}
            />
          </div>
        </article>

        <DeskStoryGrid articles={deskArticles.slice(0, 4)} compact />
      </div>

      <aside
        aria-labelledby="today-heading"
        className="border-t border-ink bg-canvas px-5 py-7 sm:px-8 xl:border-l xl:border-t-0 xl:px-6"
      >
        <div className="flex items-center gap-4 border-b border-line pb-3">
          <h2
            className="bg-signal px-3 py-1 font-sans text-sm font-black uppercase tracking-[0.17em] text-signalInk"
            id="today-heading"
          >
            Today
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>
        <ol className="mt-1 grid sm:grid-cols-2 sm:gap-x-6 xl:block">
          {supportingArticles.slice(0, 5).map((supportingArticle) => {
            const category = getCategory(supportingArticle.category);

            return (
              <li className="border-b border-line py-4" key={supportingArticle.slug}>
                <Link
                  aria-label={supportingArticle.title}
                  className="group grid min-h-20 grid-cols-[6.4rem_1fr] items-center gap-4"
                  href={`/article/${supportingArticle.slug}`}
                >
                  <span className="relative block aspect-[4/3] overflow-hidden bg-panel">
                    <Image
                      alt={supportingArticle.title}
                      className="object-cover grayscale-[22%] transition duration-300 group-hover:grayscale-0"
                      fill
                      sizes="(max-width: 639px) 102px, (max-width: 1279px) 18vw, 102px"
                      src={supportingArticle.coverImage}
                    />
                  </span>
                  <span>
                    <span
                      className="editorial-category"
                      data-accent={category.accent}
                    >
                      {category.label}
                    </span>
                    <span className="mt-1 block font-serif text-lg font-semibold leading-[1.05] tracking-[-0.025em] group-hover:underline">
                      {supportingArticle.title}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="editorial-promise mt-8 border-t-2 border-ink pt-7">
          <span aria-hidden="true" className="mb-5 block h-[3px] w-10 bg-signal" />
          <p className="font-serif text-3xl font-semibold leading-[0.98] tracking-[-0.045em]">
            A wider world.<br />A clearer view.
          </p>
        </div>
      </aside>
    </section>
  );
}
