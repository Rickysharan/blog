import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

function gitBlobSha(value: Buffer): string {
  return createHash("sha1").update(Buffer.from(`blob ${value.byteLength}\0`)).update(value).digest("hex");
}

test("reads, version-saves, and deliberately publishes exact controlled bytes", async ({ page, request }) => {
  const title = process.env.STUDIO_E2E_CONTROLLED_DRAFT_TITLE;
  const category = process.env.STUDIO_E2E_CONTROLLED_DRAFT_CATEGORY;
  test.skip(
    process.env.STUDIO_E2E_ALLOW_MUTATION !== "true" || !title || !category || !process.env.STUDIO_E2E_STORAGE_STATE,
    "The disposable preview draft and explicit mutation switch are required.",
  );
  if (!title || !category) throw new Error("Controlled draft title and category are required.");

  await page.goto("/content");
  await page.getByRole("button", { name: title, exact: true }).click();
  const loadedVersion = (await page.locator(".content-loaded-version code").textContent())?.trim();
  expect(loadedVersion).toMatch(/^[a-f0-9]{40}$/);

  const editor = page.getByLabel("MDX content");
  const controlledBytes = `${await editor.inputValue()}\n<!-- rollout:${Date.now()} -->\n`;
  await editor.fill(controlledBytes);
  const saveResponse = page.waitForResponse((response) => response.url().includes("/api/content/drafts/") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save private draft" }).click();
  const saved = await saveResponse;
  expect(saved.status()).toBe(200);
  const savedPayload = await saved.json();
  expect(savedPayload.draft.mdx).toBe(controlledBytes);
  expect(savedPayload.draft.version).toMatch(/^[a-f0-9]{40}$/);
  expect(savedPayload.draft.version).not.toBe(loadedVersion);
  const draftPath = new URL(saved.url()).pathname;
  const readBack = await page.request.get(draftPath, { headers: { "cache-control": "no-cache" } });
  expect(readBack.status()).toBe(200);
  const readBackPayload = await readBack.json();
  expect(readBackPayload.draft.mdx).toBe(controlledBytes);
  expect(readBackPayload.draft.version).toBe(savedPayload.draft.version);
  await expect(page.getByRole("status")).toContainText("Draft saved");

  await page.getByRole("button", { name: "Publish…" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm publication" });
  await dialog.getByLabel("Confirm article title").fill(title);
  await dialog.getByLabel("Confirm category").selectOption(category);
  await dialog.getByLabel(/I reviewed the editor contents/).check();
  const publishResponse = page.waitForResponse((response) => response.url().includes("/api/content/drafts/") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Publish now" }).click();
  const published = await publishResponse;
  expect(published.status()).toBe(200);
  const publishPayload = await published.json();
  expect(publishPayload.result.articlePath).toMatch(/^content\/articles\/[a-z0-9-]+\/[a-z0-9-]+\.mdx$/);
  expect(publishPayload.result.commitUrl).toMatch(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/commit\/[a-f0-9]{40}$/);

  const commit = publishPayload.result.commitUrl.split("/").at(-1);
  const repository = process.env.STUDIO_E2E_GITHUB_REPOSITORY;
  expect(repository).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  const raw = await request.get(`https://raw.githubusercontent.com/${repository}/${commit}/${publishPayload.result.articlePath}`);
  expect(raw.status()).toBe(200);
  const publishedBytes = Buffer.from(await raw.body());
  expect(publishedBytes.equals(Buffer.from(controlledBytes))).toBe(true);
  expect(gitBlobSha(publishedBytes)).toMatch(/^[a-f0-9]{40}$/);
  await expect(page.getByRole("status")).toContainText("Article published");
});
