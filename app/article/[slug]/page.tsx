import type { Metadata } from "next";
import Image from "next/image";
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

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <article>
        <header className="mx-auto max-w-4xl text-center">
          <CategoryLabel category={article.category} />
          <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            {article.title}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-muted">
            {article.excerpt}
          </p>
          <div className="mt-6 flex justify-center">
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
        </header>

        <div className="relative mt-10 aspect-[16/9] overflow-hidden bg-line/30">
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            priority
            sizes="(max-width: 1279px) 100vw, 1280px"
            className="object-cover"
          />
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <ArticleBody>{body}</ArticleBody>
          <SourceAttribution name={article.sourceName} url={article.sourceUrl} />
          <div className="mt-12">
            <AdSlot
              adsenseClientId={process.env.ADSENSE_CLIENT_ID}
              adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
              variant="article"
            />
          </div>
        </div>
      </article>

      <RelatedArticles articles={related} />
    </main>
  );
}
