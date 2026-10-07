import type { ArticleSummary } from "@/lib/content/schema";
import { getAuthorProfile } from "@/lib/config/authors";

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
  const authorProfile = getAuthorProfile(article.author);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    datePublished: `${article.date}T00:00:00.000Z`,
    dateModified: `${article.modifiedDate ?? article.date}T00:00:00.000Z`,
    mainEntityOfPage: canonical,
    url: canonical,
    image: [new URL(article.coverImage, `${site.url}/`).toString()],
    articleSection: article.category,
    inLanguage: article.language ?? "en",
    keywords: article.tags,
    isBasedOn: article.sourceUrl,
    author: {
      "@type": article.author === site.publisher ? "Organization" : "Person",
      ...(article.author === site.publisher ? { "@id": `${site.url}/#organization` } : {}),
      name: article.author,
      ...(authorProfile ? { url: `${site.url}${authorProfile.path}` } : {}),
    },
    publisher: {
      "@type": "Organization",
      "@id": `${site.url}/#organization`,
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
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
