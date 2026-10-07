import type { ArticleSummary } from "@/lib/content/schema";

type NewsSite = { name: string; url: string; locale: string };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildNewsSitemapXml(
  articles: readonly ArticleSummary[],
  site: NewsSite,
  now = new Date(),
): string {
  const latestDate = now.toISOString().slice(0, 10);
  const previousDateValue = new Date(`${latestDate}T00:00:00.000Z`);
  previousDateValue.setUTCDate(previousDateValue.getUTCDate() - 1);
  const previousDate = previousDateValue.toISOString().slice(0, 10);
  const language = site.locale.split(/[_-]/, 1)[0]?.toLowerCase() || "en";
  const entries = [...articles]
    .filter(({ date }) => date >= previousDate && date <= latestDate)
    .sort((left, right) => right.date.localeCompare(left.date) || left.title.localeCompare(right.title))
    .slice(0, 1_000)
    .map((article) => `  <url>
    <loc>${escapeXml(`${site.url}/article/${article.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(site.name)}</news:name>
        <news:language>${escapeXml(language)}</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(article.date)}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>
`;
}
