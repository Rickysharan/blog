import Image from "next/image";
import Link from "next/link";

import { ArticleMeta } from "@/components/articles/article-meta";
import { CategoryLabel } from "@/components/articles/category-label";
import type { ArticleSummary } from "@/lib/content/schema";

export function ArticleCard({
  article,
  priority = false,
}: {
  article: ArticleSummary;
  priority?: boolean;
}) {
  return (
    <article className="group flex h-full flex-col border-t-2 border-ink pt-4">
      <div className="relative aspect-[16/9] overflow-hidden bg-panel">
        <Image
          src={article.coverImage}
          alt={article.title}
          fill
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
        />
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <CategoryLabel category={article.category} />
        <h3 className="mt-3 font-serif text-2xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-3xl">
          <Link
            href={`/article/${article.slug}`}
            aria-label={`Read ${article.title}`}
            className="decoration-2 decoration-signal underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
        </h3>
        <p className="mt-3 flex-1 text-sm leading-6 text-muted">{article.excerpt}</p>
        <div className="mt-5">
          <ArticleMeta
            author={article.author}
            date={article.date}
            readTime={article.readTime}
          />
        </div>
      </div>
    </article>
  );
}
