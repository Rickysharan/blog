import type { MetadataRoute } from "next";

import { CATEGORIES } from "@/lib/config/categories";
import { SITE_CONFIG } from "@/lib/config/site";
import { getAllArticles } from "@/lib/content/articles";
import { getQualifiedTopics } from "@/lib/content/topics";

const STATIC_PATHS = [
  "",
  "/about",
  "/advertise",
  "/contact",
  "/disclaimer",
  "/guidelines",
  "/privacy",
  "/terms",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getAllArticles();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((pathname) => ({
    url: `${SITE_CONFIG.url}${pathname}`,
    changeFrequency: pathname ? "monthly" : "daily",
    priority: pathname ? 0.5 : 1,
  }));
  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map(({ slug }) => ({
    url: `${SITE_CONFIG.url}/category/${slug}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));
  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${SITE_CONFIG.url}/article/${article.slug}`,
    lastModified: new Date(`${article.date}T00:00:00.000Z`),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  const topicEntries: MetadataRoute.Sitemap = getQualifiedTopics(articles).map((topic) => ({
    url: `${SITE_CONFIG.url}${topic.canonicalPath}`,
    lastModified: new Date(`${topic.articles[0]!.date}T00:00:00.000Z`),
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  return [...staticEntries, ...categoryEntries, ...topicEntries, ...articleEntries];
}
