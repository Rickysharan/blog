import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdSlot } from "@/components/ads/ad-slot";
import { ArticleCard } from "@/components/articles/article-card";
import { ArticleListItem } from "@/components/articles/article-list-item";
import { Pagination } from "@/components/articles/pagination";
import {
  CATEGORIES,
  getCategory,
  isCategorySlug,
} from "@/lib/config/categories";
import {
  getArticlesByCategory,
  paginateArticles,
} from "@/lib/content/articles";
import { SITE_CONFIG } from "@/lib/config/site";

const PAGE_SIZE = 10;

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function parsePage(value: string | string[] | undefined): number {
  if (value === undefined) {
    return 1;
  }
  if (Array.isArray(value) || !/^[1-9]\d*$/.test(value)) {
    notFound();
  }
  return Number(value);
}

export function generateStaticParams() {
  return CATEGORIES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isCategorySlug(slug)) {
    notFound();
  }
  const category = getCategory(slug);
  const canonical = `${SITE_CONFIG.url}/category/${slug}`;

  return {
    title: category.label,
    description: category.description,
    alternates: { canonical },
    openGraph: {
      title: `${category.label} | ${SITE_CONFIG.name}`,
      description: category.description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: `${category.label} | ${SITE_CONFIG.name}`,
      description: category.description,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!isCategorySlug(slug)) {
    notFound();
  }

  const requestedPage = parsePage(query.page);
  const category = getCategory(slug);
  const articles = await getArticlesByCategory(slug);
  const pageCount = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
  if (requestedPage > pageCount) {
    notFound();
  }
  const archive = paginateArticles(articles, requestedPage, PAGE_SIZE);
  const [featured, ...remaining] = archive.items;

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="grid gap-7 border-b-2 border-ink pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">
            OmniLede desk · Global coverage
          </p>
          <h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.055em] sm:text-7xl lg:text-8xl">
            {category.label}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            {category.description}
          </p>
        </div>
        <p className="max-w-sm border-l-2 border-signal pl-5 text-sm leading-6 text-muted">
          Original explainers and verified updates, selected for their worldwide relevance and reviewed before publication.
        </p>
      </header>

      <div className="mt-8">
        <AdSlot
          adsenseClientId={process.env.ADSENSE_CLIENT_ID}
          adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
          slotId={process.env.ADSENSE_SLOT_IN_FEED}
          variant="header"
        />
      </div>

      <section aria-label={`${category.label} articles`} className="mt-12">
        {featured ? (
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-muted">Featured in {category.label}</p>
              <ArticleCard article={featured} priority />
            </div>
            <div>
              <h2 className="border-b-2 border-ink pb-3 font-serif text-4xl font-semibold tracking-[-0.045em]">
                Latest from the desk
              </h2>
              {remaining.length > 0 ? (
                remaining.map((article) => (
                  <ArticleListItem key={article.slug} article={article} />
                ))
              ) : (
                <p className="border-b border-line py-10 text-sm leading-6 text-muted">
                  More reviewed reporting is being prepared. New stories appear here after editorial approval.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="py-12 text-muted">No published articles in this desk yet.</p>
        )}
      </section>

      <Pagination
        page={archive.page}
        pageCount={archive.pageCount}
        basePath={`/category/${slug}`}
      />
    </main>
  );
}
