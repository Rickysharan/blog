import path from "node:path";

import matter from "gray-matter";
import { z } from "zod";

import {
  articleSlugSchema,
  articleTagsSchema,
  bcp47LanguageSchema,
  categorySchema,
  httpsUrlSchema,
  publicationDateSchema,
  regionSchema,
} from "@omnilede/contracts";

const coverImageSchema = z.string().refine(
  (value) => {
    if (value.startsWith("/") && !value.startsWith("//")) {
      return true;
    }

    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "coverImage must be a local path or HTTPS URL" },
);

const articleFrontmatterInputSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    slug: articleSlugSchema,
    date: publicationDateSchema,
    category: categorySchema,
    tags: articleTagsSchema,
    author: z.string().trim().min(1).max(100),
    excerpt: z.string().trim().min(1).max(320),
    coverImage: coverImageSchema,
    readTime: z.number().int().positive().max(120),
    sourceName: z.string().trim().min(1).max(120),
    sourceUrl: httpsUrlSchema,
    region: regionSchema.optional(),
    language: bcp47LanguageSchema.optional(),
    contributorId: z.string().uuid().optional(),
    contributorName: z.string().trim().min(1).max(100).optional(),
    submissionId: z.string().uuid().optional(),
    publicationId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((article, context) => {
    const contributorFields = [
      "contributorId",
      "contributorName",
      "submissionId",
      "publicationId",
    ] as const;
    const hasContributorAttribution = contributorFields.some(
      (field) => article[field] !== undefined,
    );

    if (!hasContributorAttribution) {
      return;
    }

    for (const field of [...contributorFields, "region", "language"] as const) {
      if (article[field] === undefined) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "contributor attribution requires all contributor fields, region, and language",
        });
      }
    }
  });

export const articleFrontmatterSchema = articleFrontmatterInputSchema.transform(
  (article) => ({
    ...article,
    language: article.language ?? "en",
  }),
);

export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;
export type ArticleSummary = Omit<ArticleFrontmatter, "language"> & {
  language?: ArticleFrontmatter["language"];
};
export type ArticleDocument = ArticleFrontmatter & { body: string };

function formatSchemaError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
      return `${field}: ${issue.message}`;
    })
    .join("; ");
}

export function parseArticleFile(
  source: string,
  filePath: string,
): ArticleDocument {
  let parsed: matter.GrayMatterFile<string>;

  try {
    parsed = matter(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Invalid article frontmatter: ${message}`);
  }

  const result = articleFrontmatterSchema.safeParse(parsed.data);
  if (!result.success) {
    throw new Error(`Invalid article frontmatter: ${formatSchemaError(result.error)}`);
  }

  const filename = path.basename(filePath, path.extname(filePath));
  if (filename !== result.data.slug) {
    throw new Error(
      `Article filename must match frontmatter slug: expected ${result.data.slug}.mdx`,
    );
  }

  return {
    ...result.data,
    body: parsed.content.trim(),
  };
}
