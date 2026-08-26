import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import {
  CATEGORY_SLUGS,
  type CategorySlug,
} from "@/lib/config/categories";
import {
  parseArticleFile,
  type ArticleDocument,
  type ArticleSummary,
} from "@/lib/content/schema";

export type ContentOptions = { rootDir?: string };

function contentRoot(options: ContentOptions): string {
  return options.rootDir ?? path.join(process.cwd(), "content");
}

async function readCategoryDocuments(
  rootDir: string,
  category: CategorySlug,
): Promise<ArticleDocument[]> {
  const categoryDir = path.join(rootDir, "articles", category);
  let entries: Dirent<string>[];

  try {
    entries = await fs.readdir(categoryDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(categoryDir, filename);
      const article = parseArticleFile(await fs.readFile(filePath, "utf8"), filePath);
      if (article.category !== category) {
        throw new Error(
          `Article category must match its directory: ${filename} is in ${category}`,
        );
      }
      return article;
    }),
  );
}

async function readAllDocuments(
  options: ContentOptions = {},
): Promise<ArticleDocument[]> {
  const groups = await Promise.all(
    CATEGORY_SLUGS.map((category) =>
      readCategoryDocuments(contentRoot(options), category),
    ),
  );
  const documents = groups.flat();
  const seen = new Set<string>();

  for (const article of documents) {
    if (seen.has(article.slug)) {
      throw new Error(`Duplicate published slug detected: ${article.slug}`);
    }
    seen.add(article.slug);
  }

  return documents.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
  );
}

function toSummary(article: ArticleDocument): ArticleSummary {
  return {
    title: article.title,
    slug: article.slug,
    date: article.date,
    category: article.category,
    tags: article.tags,
    author: article.author,
    excerpt: article.excerpt,
    coverImage: article.coverImage,
    readTime: article.readTime,
    sourceName: article.sourceName,
    sourceUrl: article.sourceUrl,
  };
}

export async function getAllArticles(
  options: ContentOptions = {},
): Promise<ArticleSummary[]> {
  return (await readAllDocuments(options)).map(toSummary);
}

export async function getArticleBySlug(
  slug: string,
  options: ContentOptions = {},
): Promise<ArticleDocument | null> {
  return (await readAllDocuments(options)).find((article) => article.slug === slug) ?? null;
}

export async function getArticlesByCategory(
  category: CategorySlug,
  options: ContentOptions = {},
): Promise<ArticleSummary[]> {
  return (await getAllArticles(options)).filter(
    (article) => article.category === category,
  );
}

export function paginateArticles<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
} {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const requestedPage = Number.isInteger(page) ? page : 1;
  const safePage = Math.min(Math.max(requestedPage, 1), pageCount);
  const offset = (safePage - 1) * safePageSize;

  return {
    items: items.slice(offset, offset + safePageSize),
    page: safePage,
    pageCount,
    total: items.length,
  };
}

export function getRelatedArticles(
  subject: ArticleSummary,
  candidates: readonly ArticleSummary[],
  limit = 3,
): ArticleSummary[] {
  const subjectTags = new Set(subject.tags.map((tag) => tag.toLocaleLowerCase()));

  return candidates
    .filter((candidate) => candidate.slug !== subject.slug)
    .map((candidate) => ({
      article: candidate,
      sharedTags: candidate.tags.reduce(
        (total, tag) =>
          total + Number(subjectTags.has(tag.toLocaleLowerCase())),
        0,
      ),
    }))
    .filter(({ sharedTags }) => sharedTags > 0)
    .sort(
      (left, right) =>
        right.sharedTags - left.sharedTags ||
        right.article.date.localeCompare(left.article.date) ||
        left.article.title.localeCompare(right.article.title),
    )
    .slice(0, Math.max(0, limit))
    .map(({ article }) => article);
}
