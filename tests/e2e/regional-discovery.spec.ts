import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import matter from "gray-matter";

import { expect, settleConsent, test } from "./fixtures";

const categoryDir = path.join(process.cwd(), "content", "articles", "politics");
const fixtureRunId = randomUUID();
const fixtures = [
  {
    slug: `a-e2e-global-feature-${fixtureRunId}`,
    title: `A E2E Global Feature ${fixtureRunId}`,
    region: "global",
    language: "en",
    publicationId: randomUUID(),
    submissionId: randomUUID(),
  },
  {
    slug: `b-e2e-global-story-${fixtureRunId}`,
    title: `B E2E Global Story ${fixtureRunId}`,
    region: "global",
    language: "en",
    publicationId: randomUUID(),
    submissionId: randomUUID(),
  },
  {
    slug: `c-e2e-asia-story-${fixtureRunId}`,
    title: `C E2E Asia Story ${fixtureRunId}`,
    region: "asia",
    language: "en-IN",
    publicationId: randomUUID(),
    submissionId: randomUUID(),
  },
] as const;
const createdFixturePaths = new Set<string>();

function fixtureMdx(fixture: (typeof fixtures)[number]): string {
  return matter.stringify(
    `## What happened\n\nThis isolated article verifies regional discovery without changing production content.\n\n## Why it matters\n\nGlobal coverage remains visible while an explicit reader choice can reorder relevant reporting.\n\nSource: [E2E Source](https://example.com/${fixture.slug})\n`,
    {
      title: fixture.title,
      slug: fixture.slug,
      date: "2026-09-09",
      category: "politics",
      tags: ["E2E", fixture.region],
      author: "Fixture Contributor",
      excerpt: "An isolated contributor article for regional discovery verification.",
      coverImage: "/images/articles/politics.svg",
      readTime: 2,
      sourceName: "E2E Source",
      sourceUrl: `https://example.com/${fixture.slug}`,
      region: fixture.region,
      language: fixture.language,
      contributorId: randomUUID(),
      contributorName: "Fixture Contributor",
      submissionId: fixture.submissionId,
      publicationId: fixture.publicationId,
    },
  );
}

test.beforeAll(async () => {
  await fs.mkdir(categoryDir, { recursive: true });
  for (const fixture of fixtures) {
    const fixturePath = path.join(categoryDir, `${fixture.slug}.mdx`);
    await fs.writeFile(fixturePath, fixtureMdx(fixture), { encoding: "utf8", flag: "wx" });
    createdFixturePaths.add(fixturePath);
  }
});

test.afterAll(async () => {
  await Promise.all([...createdFixturePaths].map((fixturePath) => fs.rm(fixturePath, { force: true })));
});

test("suggests a broad region, persists only a choice, and resets to Global", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/region-context", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "IN", region: "asia", source: "netlify" }),
    }),
  );

  await page.goto("/");
  await settleConsent(page);
  await expect(page.getByRole("link", { name: fixtures[0].title, exact: true }).first()).toBeVisible();

  await page.goto("/category/politics");
  await expect(page.getByText("Showing: Suggested — Asia")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("omnilede-region-preference"))).toBeNull();

  const feed = page.getByRole("heading", { name: "Latest from the desk" }).locator("xpath=ancestor::section[1]");
  const storyLinks = feed.locator('a[href^="/article/"]');
  await expect(storyLinks.first()).toHaveText(fixtures[2].title);
  await expect(feed.getByRole("link", { name: fixtures[1].title })).toBeVisible();

  await page.getByLabel("Region").selectOption("europe");
  await page.getByLabel("Language").selectOption("en-GB");
  await expect(page.getByText("Showing: Your choice — Europe · en-GB")).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("omnilede-region-preference") ?? "null")),
  ).toEqual({ region: "europe", language: "en-GB" });

  await page.reload();
  await expect(page.getByText("Showing: Your choice — Europe · en-GB")).toBeVisible();
  await page.getByRole("button", { name: "Reset to Global" }).click();
  await expect(page.getByText("Showing: Global")).toBeVisible();
  await expect(storyLinks.first()).toHaveText(fixtures[1].title);
  expect(await page.evaluate(() => localStorage.getItem("omnilede-region-preference"))).toBeNull();
  expect(browserErrors).toEqual([]);
});

test("falls back to Global when Edge context is missing and keeps every story", async ({ page }) => {
  await page.route("**/api/region-context", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ countryCode: null, region: "global", source: "fallback" }),
    }),
  );

  await page.goto("/category/politics");
  await expect(page.getByText("Showing: Global")).toBeVisible();
  await expect(page.getByRole("link", { name: fixtures[1].title })).toBeVisible();
  await expect(page.getByRole("link", { name: fixtures[2].title })).toBeVisible();
});
