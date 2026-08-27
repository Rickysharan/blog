import { expect, settleConsent, test } from "./fixtures";

test("search, theme, and consent settings remain usable", async ({ page }) => {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /accept optional cookies/i })).toBeVisible();
  await page.getByRole("button", { name: /decline optional cookies/i }).click();

  await page.getByRole("searchbox", { name: /search published stories/i }).fill("simulcast");
  await expect(page.getByRole("status")).toContainText(/matched/i);

  const themeButton = page.getByRole("button", { name: /theme: .* change theme/i });
  await themeButton.click();
  await page.getByRole("button", { name: /theme: .* change theme/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: /theme: .* change theme/i }).click();
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
  await settleConsent(page);
});
