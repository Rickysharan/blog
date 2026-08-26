import type { Metadata } from "next";
import { notFound } from "next/navigation";

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

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="border-b-2 border-ink pb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          OmniLede desk
        </p>
        <h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
          {category.label}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          {category.description}
        </p>
      </header>

      <section aria-label={`${category.label} articles`}>
        {archive.items.length > 0 ? (
          archive.items.map((article) => (
            <ArticleListItem key={article.slug} article={article} />
          ))
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
