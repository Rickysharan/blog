import { expect, settleConsent, test } from "./fixtures";

test("reader can browse every desk and open an attributed article", async ({ page }) => {
  await page.goto("/");
  await settleConsent(page);

  for (const label of ["Anime", "Movies", "Politics", "Sports", "Finance", "Share Market"]) {
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  }

  await page.getByRole("link", { name: /Read .+/ }).first().click();
  await expect(page).toHaveURL(/\/article\//);
  await expect(page.getByRole("heading", { name: /.+/ }).first()).toBeVisible();
  await expect(page.getByText("Source:", { exact: true })).toBeVisible();
});

test("category archives keep the global desk navigation available", async ({ page }) => {
  await page.goto("/category/politics");
  await settleConsent(page);
  await expect(page.getByRole("heading", { name: "Politics", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Anime", exact: true }).first()).toBeVisible();
});
