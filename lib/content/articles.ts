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
  const publicationIds = new Set<string>();

  for (const article of documents) {
    if (seen.has(article.slug)) {
      throw new Error(`Duplicate published slug detected: ${article.slug}`);
    }
    seen.add(article.slug);

    if (article.publicationId) {
      if (publicationIds.has(article.publicationId)) {
        throw new Error(
          `Duplicate publication ID detected: ${article.publicationId}`,
        );
      }
      publicationIds.add(article.publicationId);
    }
  }

  return documents.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.title.localeCompare(right.title),
  );
}

function toSummary(article: ArticleDocument): ArticleSummary {
  const { body, ...summary } = article;
  void body;
  return summary;
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
  limit = 4,
): ArticleSummary[] {
  const subjectTags = new Set(subject.tags.map((tag) => tag.toLocaleLowerCase()));
  const seenSlugs = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    if (seenSlugs.has(candidate.slug)) return false;
    seenSlugs.add(candidate.slug);
    return true;
  });

  return uniqueCandidates
    .filter((candidate) => candidate.slug !== subject.slug)
    .map((candidate) => ({
      article: candidate,
      sharedTags: candidate.tags.reduce(
        (total, tag) =>
          total + Number(subjectTags.has(tag.toLocaleLowerCase())),
        0,
      ),
      tier: candidate.tags.some((tag) => subjectTags.has(tag.toLocaleLowerCase()))
        ? 0
        : candidate.category === subject.category ? 1 : 2,
    }))
    .sort(
      (left, right) =>
        left.tier - right.tier ||
        (left.tier === 0 ? right.sharedTags - left.sharedTags : 0) ||
        right.article.date.localeCompare(left.article.date) ||
        left.article.title.localeCompare(right.article.title) ||
        left.article.slug.localeCompare(right.article.slug),
    )
    .slice(0, Math.max(0, limit))
    .map(({ article }) => article);
}
