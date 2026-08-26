import path from "node:path";

import { isCategorySlug } from "@/lib/config/categories";
import { parseArticleFile, type ArticleDocument } from "@/lib/content/schema";
import { DraftRepositoryError, type DraftRef } from "@/lib/drafts/types";

const DRAFT_FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/;
const MAX_DRAFT_BYTES = 256 * 1024;
const MODULE_STATEMENT = /^\s*(?:import|export)\s/m;

export function validateDraftRef(input: {
  category: string;
  filename: string;
}): DraftRef {
  if (!isCategorySlug(input.category)) {
    throw new DraftRepositoryError("invalid_input", "Draft category is not supported");
  }
  if (!DRAFT_FILENAME.test(input.filename)) {
    throw new DraftRepositoryError("invalid_input", "Draft filename is invalid");
  }
  return { category: input.category, filename: input.filename };
}

function finalVisibleLine(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? "";
}

export function validateDraftMdx(refInput: DraftRef, mdx: string): ArticleDocument {
  const ref = validateDraftRef(refInput);
  if (new TextEncoder().encode(mdx).byteLength > MAX_DRAFT_BYTES) {
    throw new DraftRepositoryError("invalid_input", "Draft exceeds the 256 KiB limit");
  }
  if (MODULE_STATEMENT.test(mdx)) {
    throw new DraftRepositoryError("invalid_input", "Draft MDX imports and exports are not allowed");
  }

  let article: ArticleDocument;
  try {
    article = parseArticleFile(mdx, ref.filename);
  } catch (error) {
    throw new DraftRepositoryError(
      "invalid_input",
      error instanceof Error ? error.message : "Draft frontmatter is invalid",
      { cause: error },
    );
  }
  if (article.category !== ref.category) {
    throw new DraftRepositoryError(
      "invalid_input",
      "Draft category must match its directory",
    );
  }
  if (article.slug !== path.basename(ref.filename, ".mdx")) {
    throw new DraftRepositoryError(
      "invalid_input",
      "Draft slug must match its filename",
    );
  }
  if (!/^## Why it matters\s*$/m.test(article.body)) {
    throw new DraftRepositoryError(
      "invalid_input",
      'Draft must include a "## Why it matters" section',
    );
  }
  const lastLine = finalVisibleLine(article.body);
  if (!lastLine.startsWith("Source: [") || !lastLine.endsWith(`](${article.sourceUrl})`)) {
    throw new DraftRepositoryError(
      "invalid_input",
      "Draft must end with a visible source link matching sourceUrl",
    );
  }
  return article;
}
