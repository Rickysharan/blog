import Image from "next/image";
import Link from "next/link";

import { ArticleMeta } from "@/components/articles/article-meta";
import { CategoryLabel } from "@/components/articles/category-label";
import type { ArticleSummary } from "@/lib/content/schema";

export function LeadStory({ article }: { article: ArticleSummary }) {
  return (
    <article className="grid gap-7 border-y border-line py-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12">
      <div className="relative aspect-[16/9] overflow-hidden bg-line/30">
        <Image
          src={article.coverImage}
          alt={article.title}
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 58vw"
          className="object-cover"
        />
      </div>
      <div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Lead story
        </p>
        <CategoryLabel category={article.category} />
        <h2 className="mt-4 font-serif text-4xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          <Link
            href={`/article/${article.slug}`}
            className="decoration-4 underline-offset-8 hover:underline"
          >
            {article.title}
          </Link>
        </h2>
        <p className="mt-5 text-base leading-7 text-muted sm:text-lg">
          {article.excerpt}
        </p>
        <div className="mt-6">
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
