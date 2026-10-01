import { promises as fs } from "node:fs";
import path from "node:path";

import { makeValidMdx } from "../../tests/helpers/temp-content";
import { expect, settleConsent, test } from "./fixtures";

const slug = "e2e-review-story";
const draftPath = path.join(process.cwd(), "content", "drafts", "anime", `${slug}.mdx`);
const articlePath = path.join(process.cwd(), "content", "articles", "anime", `${slug}.mdx`);

function deliveredDraftMdx() {
  const photoBlocks = [1, 2].map((id) => `![Related archive image ${id}](https://upload.wikimedia.org/photo${id}.jpg)

Related archive image: Related archive image ${id}. Photo: Photographer ${id} / [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Photo${id}.jpg), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Not a photograph of this news event.`).join("\n\n");
  return makeValidMdx({ slug, title: "E2E Review Desk Story" })
    .replace("\nSource: ", `\n${photoBlocks}\n\nSource: `);
}

test.beforeEach(async () => {
  await fs.rm(articlePath, { force: true });
  await fs.mkdir(path.dirname(draftPath), { recursive: true });
  await fs.writeFile(
    draftPath,
    deliveredDraftMdx(),
    "utf8",
  );
});

test.afterEach(async () => {
  await fs.rm(draftPath, { force: true });
  await fs.rm(articlePath, { force: true });
});

test("draft does not become public until Publish is confirmed", async ({ page }) => {
  const before = await page.request.get(`/article/${slug}`);
  expect(before.status()).toBe(404);

  await page.goto("/admin/review");
  await page.waitForLoadState("networkidle");
  await settleConsent(page);
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.getByLabel("Password").fill("e2e-admin-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/review/);
  await expect(page.getByRole("heading", { name: "Draft review desk" })).toBeVisible();
  await expect(page.getByRole("button", { name: "E2E Review Desk Story" })).toBeVisible();
  await page.getByRole("button", { name: "E2E Review Desk Story" }).click();
  const editor = page.getByLabel("MDX content");
  await expect(editor).toBeVisible();
  const pictureBlocks = (await editor.inputValue()).match(/^!\[/gm) ?? [];
  expect(pictureBlocks.length).toBeGreaterThanOrEqual(2);
  expect(pictureBlocks.length).toBeLessThanOrEqual(3);
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

  const stillDraft = await page.request.get(`/article/${slug}`);
  expect(stillDraft.status()).toBe(404);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByRole("status")).toContainText(/published/i);

  const after = await page.request.get(`/article/${slug}`);
  expect(after.status()).toBe(200);
});
