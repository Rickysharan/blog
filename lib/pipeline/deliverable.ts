import type { DraftRef } from "@/lib/drafts/types";
import { parseArticleFile, type ArticleDocument } from "@/lib/content/schema";
import type { RecoveryCategory } from "@/lib/pipeline/local-run-types";
import type { FetchLike } from "@/lib/pipeline/types";

export type DeliverableValidation =
  | { ok: true; article: ArticleDocument; imageCount: number }
  | {
      ok: false;
      category: RecoveryCategory;
      message: string;
      imageCount: number;
    };

interface ValidateDeliverableOptions {
  fetchImpl?: FetchLike;
}

const imagePattern = /^!\[[^\]\n]+\]\((https:\/\/[^\s)]+)\)\s*$/gm;
const creditPattern = /^Related archive image:[^\n]+ Photo: [^\n]+ \/ \[Wikimedia Commons\]\((https:\/\/commons\.wikimedia\.org\/[^\s)]+)\), \[(?:CC BY(?:-SA)? [\d.]+|CC0(?: [\d.]+)?)\]\((https:\/\/creativecommons\.org\/[^\s)]+)\)\. Not a photograph of this news event\.\s*$/gm;
const sourcePattern = /^\s*Source:\s*\[[^\]]+\]\(https:\/\/[^\s)]+\)\s*$/gim;

function invalid(
  category: RecoveryCategory,
  message: string,
  imageCount = 0,
): DeliverableValidation {
  return { ok: false, category, message, imageCount };
}

function comparable(value: string): string {
  return value.normalize("NFKC").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export async function validateDeliverable(
  ref: DraftRef,
  mdx: string,
  options: ValidateDeliverableOptions = {},
): Promise<DeliverableValidation> {
  let article: ArticleDocument;
  try {
    article = parseArticleFile(mdx, ref.filename);
  } catch {
    return invalid("validation-failed", "The draft frontmatter or filename is invalid.");
  }
  if (article.category !== ref.category) {
    return invalid("validation-failed", "The draft category does not match its folder.");
  }
  if (/^(?:import|export)\s/m.test(article.body) || /<\/?[A-Za-z][^>]*>/.test(article.body) || /\{[^\n{}]*\}/.test(article.body) || /<!--/.test(article.body)) {
    return invalid("generation-invalid", "The draft contains unsafe MDX.");
  }
  if (!/^## Why it matters\s*$/m.test(article.body)) {
    return invalid("generation-invalid", "The draft is missing the Why it matters section.");
  }
  const leadingH1 = article.body.match(/^\s*#\s+([^\n]+)\s*(?:\n|$)/);
  if (leadingH1 && comparable(leadingH1[1]) === comparable(article.title)) {
    return invalid("generation-invalid", "The body repeats the article headline.");
  }
  const sources = [...article.body.matchAll(sourcePattern)];
  if (sources.length !== 1) {
    return invalid("validation-failed", "The draft must contain exactly one source attribution.");
  }
  const allDestinations = [...article.body.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  if (allDestinations.some((destination) => {
    try {
      const url = new URL(destination);
      return url.protocol !== "https:" || Boolean(url.username || url.password);
    } catch {
      return true;
    }
  })) {
    return invalid("validation-failed", "Every external destination must use safe HTTPS.");
  }

  const imageUrls = [...article.body.matchAll(imagePattern)].map((match) => match[1]);
  const credits = [...article.body.matchAll(creditPattern)];
  const pages = credits.map((match) => match[1]);
  const uniqueImages = new Set(imageUrls);
  const uniquePages = new Set(pages);
  const imageCount = imageUrls.length;
  if (imageCount < 2 || imageCount > 3 || credits.length !== imageCount ||
      uniqueImages.size !== imageCount || uniquePages.size !== imageCount) {
    return invalid(
      "insufficient-images",
      "The draft needs two or three distinct pictures with complete credits.",
      imageCount,
    );
  }

  const wordCount = article.body
    .replace(/^!\[[^\n]+$/gm, "")
    .replace(/^Related archive image:[^\n]+$/gm, "")
    .replace(/^Source:[^\n]+$/gm, "")
    .match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  if (wordCount < 80 || wordCount > 1_000) {
    return invalid("generation-invalid", "The article text must contain 80–1,000 words.", imageCount);
  }

  if (options.fetchImpl) {
    for (const imageUrl of imageUrls) {
      try {
        const response = await options.fetchImpl(imageUrl, {
          method: "HEAD",
          redirect: "error",
          signal: AbortSignal.timeout(6_000),
        });
        const mime = response.headers.get("content-type")?.split(";", 1)[0].trim();
        if (!response.ok || (mime !== "image/jpeg" && mime !== "image/webp")) {
          return invalid("insufficient-images", "A credited picture is no longer reachable.", imageCount);
        }
      } catch {
        return invalid("insufficient-images", "A credited picture is no longer reachable.", imageCount);
      }
    }
  }
  return { ok: true, article, imageCount };
}
