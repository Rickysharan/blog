import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CATEGORY_SLUGS,
  type CategorySlug,
} from "@/lib/config/categories";
import { parseArticleFile } from "@/lib/content/schema";

export type ContentValidationError = {
  kind: "article" | "draft";
  path: string;
  message: string;
};

export type ContentValidationResult = {
  publishedCount: number;
  draftCount: number;
  errors: ContentValidationError[];
  valid: boolean;
};

type ValidatedFile = { slug: string };

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown validation error";
  return message.replace(/\s+/g, " ").slice(0, 400);
}

async function validateCollection(
  rootDir: string,
  directory: "articles" | "drafts",
  kind: "article" | "draft",
): Promise<{ files: ValidatedFile[]; errors: ContentValidationError[] }> {
  const files: ValidatedFile[] = [];
  const errors: ContentValidationError[] = [];

  await Promise.all(
    CATEGORY_SLUGS.map(async (category: CategorySlug) => {
      const categoryDir = path.join(rootDir, directory, category);
      let names: string[];

      try {
        names = await fs.readdir(categoryDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return;
        }
        throw error;
      }

      await Promise.all(
        names
          .filter((name) => name.endsWith(".mdx"))
          .sort()
          .map(async (name) => {
            const filePath = path.join(categoryDir, name);
            const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
            try {
              const article = parseArticleFile(
                await fs.readFile(filePath, "utf8"),
                filePath,
              );
              if (article.category !== category) {
                throw new Error(
                  `Article category must match its ${category} directory`,
                );
              }
              files.push({ slug: article.slug });
            } catch (error) {
              errors.push({
                kind,
                path: relativePath,
                message: safeErrorMessage(error),
              });
            }
          }),
      );
    }),
  );

  return { files, errors };
}

export async function validateContentTree(
  options: { rootDir?: string } = {},
): Promise<ContentValidationResult> {
  const rootDir = options.rootDir ?? path.join(process.cwd(), "content");
  const [articles, drafts] = await Promise.all([
    validateCollection(rootDir, "articles", "article"),
    validateCollection(rootDir, "drafts", "draft"),
  ]);
  const errors = [...articles.errors, ...drafts.errors];
  const seen = new Set<string>();

  for (const { slug } of articles.files) {
    if (seen.has(slug)) {
      errors.push({
        kind: "article",
        path: "articles",
        message: `Duplicate published slug detected: ${slug}`,
      });
    }
    seen.add(slug);
  }

  errors.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.message.localeCompare(right.message),
  );

  return {
    publishedCount: articles.files.length,
    draftCount: drafts.files.length,
    errors,
    valid: errors.length === 0,
  };
}
