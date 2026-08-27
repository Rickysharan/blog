import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ArticleBody } from "@/components/articles/article-body";
import { ArticleMeta } from "@/components/articles/article-meta";
import { CategoryLabel } from "@/components/articles/category-label";
import { RelatedArticles } from "@/components/articles/related-articles";
import { ShareActions } from "@/components/articles/share-actions";
import { SourceAttribution } from "@/components/articles/source-attribution";
import { AdSlot } from "@/components/ads/ad-slot";
import {
  getAllArticles,
  getArticleBySlug,
  getRelatedArticles,
} from "@/lib/content/articles";
import { renderArticleMdx } from "@/lib/content/mdx";
import { SITE_CONFIG } from "@/lib/config/site";
import { buildNewsArticleJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";

type ArticlePageProps = { params: Promise<{ slug: string }> };

const getArticle = cache((slug: string) => getArticleBySlug(slug));

export async function generateStaticParams() {
  return (await getAllArticles()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) {
    notFound();
  }
  const canonical = `${SITE_CONFIG.url}/article/${article.slug}`;

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical },
    authors: [{ name: article.author }],
    openGraph: {
      type: "article",
      title: article.title,
      description: article.excerpt,
      url: canonical,
      publishedTime: `${article.date}T00:00:00.000Z`,
      authors: [article.author],
      images: [{ url: article.coverImage, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [article.coverImage],
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const [article, allArticles] = await Promise.all([
    getArticle(slug),
    getAllArticles(),
  ]);
  if (!article) {
    notFound();
  }
  const [body, related] = await Promise.all([
    renderArticleMdx(article.body),
    Promise.resolve(getRelatedArticles(article, allArticles, 3)),
  ]);
  const jsonLd = buildNewsArticleJsonLd(article, SITE_CONFIG);

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        type="application/ld+json"
      />
      <article>
        <header className="grid gap-7 border-b-2 border-ink pb-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)] lg:items-end">
          <div>
            <p className="mb-5 text-xs font-black uppercase tracking-[0.2em] text-muted">
              OmniLede analysis
            </p>
            <CategoryLabel category={article.category} />
            <h1 className="mt-5 max-w-5xl font-serif text-4xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
              {article.title}
            </h1>
          </div>
          <div className="border-l-2 border-signal pl-5">
            <p className="text-base leading-7 text-muted sm:text-lg sm:leading-8">
              {article.excerpt}
            </p>
            <div className="mt-5">
              <ArticleMeta
                author={article.author}
                date={article.date}
                readTime={article.readTime}
              />
            </div>
            <ShareActions
              title={article.title}
              url={`${SITE_CONFIG.url}/article/${article.slug}`}
            />
          </div>
        </header>

        <div className="relative mt-8 aspect-[16/9] overflow-hidden bg-panel">
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            loading="eager"
            sizes="(max-width: 1279px) 100vw, 1280px"
            className="object-cover"
          />
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,46rem)_minmax(17rem,1fr)] lg:items-start">
          <div>
            <ArticleBody>{body}</ArticleBody>
            <SourceAttribution name={article.sourceName} url={article.sourceUrl} />
            <div className="mt-12">
              <AdSlot
                adsenseClientId={process.env.ADSENSE_CLIENT_ID}
                adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
                slotId={process.env.ADSENSE_SLOT_ARTICLE}
                variant="article"
              />
            </div>
          </div>
          <aside className="space-y-8 lg:sticky lg:top-6" aria-label="Article information and advertising">
            <div className="border-t-2 border-ink bg-panel p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">
                Editorial standard
              </p>
              <p className="mt-3 font-serif text-2xl font-semibold leading-tight">
                Facts first. Context added. Sources visible.
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                Every story is reviewed by a human editor before it reaches this page.
              </p>
              <Link className="mt-5 inline-flex border-b-2 border-signal pb-1 text-xs font-black uppercase tracking-[0.14em]" href="/about">
                How OmniLede works
              </Link>
            </div>
            <AdSlot
              adsenseClientId={process.env.ADSENSE_CLIENT_ID}
              adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
              slotId={process.env.ADSENSE_SLOT_SIDEBAR}
              variant="sidebar"
            />
          </aside>
        </div>
      </article>

      <RelatedArticles articles={related} />
    </main>
  );
}
