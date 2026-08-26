import type { ArticleSummary } from "@/lib/content/schema";

interface RssSite {
  name: string;
  description: string;
  url: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRssXml(
  articles: readonly ArticleSummary[],
  site: RssSite,
): string {
  const recent = [...articles]
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
    )
    .slice(0, 20);
  const lastBuildDate = recent[0]
    ? new Date(`${recent[0].date}T00:00:00.000Z`).toUTCString()
    : new Date(0).toUTCString();
  const items = recent
    .map((article) => {
      const link = `${site.url}/article/${article.slug}`;
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(`${article.date}T00:00:00.000Z`).toUTCString()}</pubDate>
      <description>${escapeXml(article.excerpt)}</description>
      <category>${escapeXml(article.category)}</category>
      <source url="${escapeXml(article.sourceUrl)}">${escapeXml(article.sourceName)}</source>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)}</title>
    <link>${escapeXml(site.url)}</link>
    <description>${escapeXml(site.description)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(`${site.url}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
