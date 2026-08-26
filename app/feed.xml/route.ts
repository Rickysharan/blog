import { getAllArticles } from "@/lib/content/articles";
import { SITE_CONFIG } from "@/lib/config/site";
import { buildRssXml } from "@/lib/seo/rss";

export const revalidate = 1_800;

export async function GET() {
  const xml = buildRssXml(await getAllArticles(), SITE_CONFIG);
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
