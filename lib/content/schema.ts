import path from "node:path";

import matter from "gray-matter";
import { z } from "zod";

import { isCategorySlug } from "@/lib/config/categories";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const dateSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
      message: "date must be a real calendar date",
    }),
);

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "must use HTTPS",
  });

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

export const articleFrontmatterSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    slug: z.string().regex(SLUG_PATTERN).max(120),
    date: dateSchema,
    category: z.string().refine(isCategorySlug, "unsupported category"),
    tags: z.array(z.string().trim().min(1).max(50)).min(1).max(12),
    author: z.string().trim().min(1).max(100),
    excerpt: z.string().trim().min(1).max(320),
    coverImage: coverImageSchema,
    readTime: z.number().int().positive().max(120),
    sourceName: z.string().trim().min(1).max(120),
    sourceUrl: httpsUrlSchema,
  })
  .strict();

export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;
export type ArticleSummary = ArticleFrontmatter;
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
