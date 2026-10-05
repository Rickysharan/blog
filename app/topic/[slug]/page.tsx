import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleCard } from "@/components/articles/article-card";
import { CATEGORIES } from "@/lib/config/categories";
import { SITE_CONFIG } from "@/lib/config/site";
import { getAllArticles } from "@/lib/content/articles";
import { getQualifiedTopics } from "@/lib/content/topics";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { buildBreadcrumbListJsonLd } from "@/lib/seo/site-json-ld";

type TopicPageProps = { params: Promise<{ slug: string }> };

async function topics() {
  return getQualifiedTopics(await getAllArticles());
}

export async function generateStaticParams() {
  return (await topics()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const topic = (await topics()).find((value) => value.slug === slug);
  if (!topic) notFound();
  const canonical = `${SITE_CONFIG.url}${topic.canonicalPath}`;
  return {
    title: topic.label,
    description: topic.summary,
    alternates: { canonical },
    openGraph: { title: `${topic.label} | ${SITE_CONFIG.name}`, description: topic.summary, url: canonical },
  };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { slug } = await params;
  const topic = (await topics()).find((value) => value.slug === slug);
  if (!topic) notFound();
  const breadcrumbs = buildBreadcrumbListJsonLd(SITE_CONFIG, [
    { name: "Home", path: "/" },
    { name: topic.label, path: topic.canonicalPath },
  ]);

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbs) }} />
      <header className="retro-page-banner">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">OmniLede topic</p>
        <h1 className="retro-display-title mt-2 font-serif text-5xl font-semibold tracking-[-0.055em] sm:text-7xl">{topic.label}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted">{topic.summary}</p>
        <nav aria-label="Desks covering this topic" className="mt-5 flex flex-wrap gap-3">
          {topic.categories.map((slug) => {
            const category = CATEGORIES.find((value) => value.slug === slug);
            return category ? <Link className="border-b-2 border-signal text-sm font-semibold" href={`/category/${slug}`} key={slug}>{category.label}</Link> : null;
          })}
        </nav>
      </header>
      <section aria-label={`${topic.label} articles`} className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
        {topic.articles.map((article, index) => <ArticleCard article={article} key={article.slug} priority={index === 0} />)}
      </section>
    </main>
  );
}
