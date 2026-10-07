import { getAllArticles } from "@/lib/content/articles";
import { SITE_CONFIG } from "@/lib/config/site";
import { buildNewsSitemapXml } from "@/lib/seo/news-sitemap";

export const revalidate = 900;

export async function GET() {
  const xml = buildNewsSitemapXml(await getAllArticles(), SITE_CONFIG);
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=900, stale-while-revalidate=1800",
      "x-content-type-options": "nosniff",
    },
  });
}
