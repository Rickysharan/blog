import type { ArticleDocument } from "./schema";

export class PublishReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishReadinessError";
  }
}

function fail(message: string): never {
  throw new PublishReadinessError(message);
}

export function validateTopTenStructure(body: string): void {
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  const firstHeading = headings[0];
  if (!firstHeading || firstHeading.index === undefined || !body.slice(0, firstHeading.index).trim()) {
    fail("A publish-ready Top 10 article requires an introduction before the list");
  }

  const whyIndexes = headings
    .map((heading, index) => heading[1] === "Why it matters" ? index : -1)
    .filter((index) => index >= 0);
  if (whyIndexes.length !== 1 || whyIndexes[0] !== headings.length - 1) {
    fail('A publish-ready Top 10 article requires one final "Why it matters" section');
  }

  const numbered = headings.slice(0, -1).map((heading) => /^(\d+)\.\s+\S/.exec(heading[1])?.[1]);
  const expected = Array.from({ length: 10 }, (_, index) => String(index + 1));
  if (numbered.length !== 10 || numbered.some((number, index) => number !== expected[index])) {
    fail("A publish-ready Top 10 article requires exactly ten sequential numbered entries");
  }
}

export function validatePublishReadyArticle(article: ArticleDocument): void {
  if (article.category !== "top-10") return;
  validateTopTenStructure(article.body);

  const visibleLines = article.body.split("\n").map((line) => line.trim()).filter(Boolean);
  const finalLine = visibleLines.at(-1) ?? "";
  if (!finalLine.startsWith("Source: [") || !finalLine.endsWith(`](${article.sourceUrl})`)) {
    fail("A publish-ready Top 10 article requires visible source attribution matching sourceUrl");
  }

  const imageCount = [...article.body.matchAll(/^!\[[^\]]+\]\(https:\/\/[^\s)]+\)\s*$/gm)].length;
  const creditCount = [...article.body.matchAll(/^.*\bPhoto:\s+.+$/gm)].length;
  if (imageCount < 2 || imageCount > 3 || creditCount < imageCount) {
    fail("A publish-ready Top 10 article requires two or three credited images");
  }
}
