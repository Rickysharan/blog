import type { ArticleSummary } from "@/lib/content/schema";

interface JsonLdSite {
  name: string;
  url: string;
  publisher: string;
}

export function buildNewsArticleJsonLd(
  article: ArticleSummary,
  site: JsonLdSite,
): Record<string, unknown> {
  const canonical = `${site.url}/article/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    datePublished: `${article.date}T00:00:00.000Z`,
    dateModified: `${article.date}T00:00:00.000Z`,
    mainEntityOfPage: canonical,
    url: canonical,
    image: [new URL(article.coverImage, `${site.url}/`).toString()],
    articleSection: article.category,
    keywords: article.tags,
    isBasedOn: article.sourceUrl,
    author: {
      "@type": "Organization",
      name: article.author,
    },
    publisher: {
      "@type": "Organization",
      name: site.publisher,
      url: site.url,
      logo: {
        "@type": "ImageObject",
        url: `${site.url}/icons/icon-512.png`,
      },
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
