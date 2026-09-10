import { expect, test } from "@playwright/test";

test.describe("review and provider fallbacks", () => {
  test("anonymous review access fails closed without exposing submission details", async ({ page }) => {
    await page.goto("/admin/review");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Freview$/);
    await expect(page.getByRole("heading", { name: /sign in to omnilede/i })).toBeVisible();
    await expect(page.getByText(/source contract|submission id|provider evidence/i)).toHaveCount(0);
  });

  test("disabled redemption mode is visible from the public standards surface", async ({ page }) => {
    await page.goto("/guidelines#points");
    await expect(page.getByRole("heading", { name: /points are a thank-you, not earnings/i })).toBeVisible();
    await expect(page.getByText(/no guaranteed cash value/i)).toBeVisible();
    await expect(page.getByText(/redemption is disabled/i)).toBeVisible();
  });
});
