import type { MetadataRoute } from "next";

import { SITE_CONFIG } from "@/lib/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/_next/", "/offline"],
    },
    sitemap: [
      `${SITE_CONFIG.url}/sitemap.xml`,
      `${SITE_CONFIG.url}/news-sitemap.xml`,
    ],
    host: SITE_CONFIG.url,
  };
}
