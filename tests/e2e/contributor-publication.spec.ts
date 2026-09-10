import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import matter from "gray-matter";

import { expect, settleConsent, test } from "./fixtures";

const contributorArticle = {
  slug: `e2e-contributor-publication-attribution-${randomUUID()}`,
  title: "E2E Contributor Publication Attribution",
};
const contributorArticlePath = path.join(
  process.cwd(),
  "content",
  "articles",
  "finance",
  `${contributorArticle.slug}.mdx`,
);
let contributorArticleCreated = false;

test.beforeAll(async () => {
  const mdx = matter.stringify(
    "## What happened\n\nThis isolated article verifies contributor attribution in the public renderer.\n\n## Why it matters\n\nReaders can distinguish reviewed contributor reporting from legacy editorial work.\n\nSource: [E2E Publication Source](https://example.com/e2e-publication-source)\n",
    {
      title: contributorArticle.title,
      slug: contributorArticle.slug,
      date: "2026-09-09",
      category: "finance",
      tags: ["E2E", "Contributors"],
      author: "Publication Fixture Contributor",
      excerpt: "An isolated article for public contributor-disclosure verification.",
      coverImage: "/images/articles/finance.svg",
      readTime: 2,
      sourceName: "E2E Publication Source",
      sourceUrl: "https://example.com/e2e-publication-source",
      region: "global",
      language: "en",
      contributorId: randomUUID(),
      contributorName: "Publication Fixture Contributor",
      submissionId: randomUUID(),
      publicationId: randomUUID(),
    },
  );
  await fs.writeFile(contributorArticlePath, mdx, { encoding: "utf8", flag: "wx" });
  contributorArticleCreated = true;
});

test.afterAll(async () => {
  if (contributorArticleCreated) {
    await fs.rm(contributorArticlePath, { force: true });
  }
});

test("legacy editorial articles retain their rendered source attribution", async ({ page }) => {
  await page.goto("/article/how-central-bank-signals-move-markets-before-rate-changes");
  await settleConsent(page);

  await expect(page.getByRole("heading", { name: "How central-bank signals move markets before rate changes" })).toBeVisible();
  await expect(page.getByText("Source:", { exact: true })).toBeVisible();
  await expect(
    page.locator('aside[aria-label="Article source"]').getByRole("link", { name: "Bank for International Settlements" }),
  ).toHaveAttribute("href", "https://www.bis.org/statistics/index.htm");
  await expect(page.getByText(/Contributor article by/i)).toHaveCount(0);
});

test("contributor publications show author, licence, finance warning, and source", async ({ page }) => {
  await page.goto(`/article/${contributorArticle.slug}`);
  await settleConsent(page);

  await expect(page.getByRole("heading", { name: contributorArticle.title })).toBeVisible();
  await expect(page.getByText("Contributor article by Publication Fixture Contributor")).toBeVisible();
  await expect(page.getByText(/non-exclusive contributor licence/i)).toBeVisible();
  await expect(page.getByText(/not verified professional financial advice/i)).toBeVisible();
  await expect(page.getByText("Source:", { exact: true })).toBeVisible();
  await expect(
    page.locator('aside[aria-label="Article source"]').getByRole("link", { name: "E2E Publication Source" }),
  ).toHaveAttribute(
    "href",
    "https://example.com/e2e-publication-source",
  );
});
