import { expect, test } from "@playwright/test";

test.describe("Contributor navigation", () => {
  test("anonymous visitors can read public pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/guidelines");
    await expect(page.getByRole("heading", { name: /guidelines/i })).toBeVisible();
  });

  test("anonymous account access redirects to login with a safe internal next path", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("anonymous admin access redirects without exposing reviewer details", async ({ page }) => {
    await page.goto("/admin/review");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Freview$/);
  });
});
