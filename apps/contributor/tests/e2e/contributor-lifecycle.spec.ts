import { expect, test } from "@playwright/test";

test.describe("contributor vertical slice", () => {
  test("takes a new contributor from public desk to standards and signup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /make the world’s signal clearer/i })).toBeVisible();
    await page.getByRole("link", { name: /read the desk guide/i }).click();
    await expect(page).toHaveURL(/\/guidelines$/);
    await expect(page.getByRole("heading", { name: /guidelines for useful reporting/i })).toBeVisible();
    await page.getByRole("link", { name: /create contributor account/i }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: /create your contributor account/i })).toBeVisible();
  });

  test("keeps account and submission surfaces behind an authenticated session", async ({ page }) => {
    for (const path of ["/dashboard", "/submit", "/articles", "/topics", "/wallet", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
