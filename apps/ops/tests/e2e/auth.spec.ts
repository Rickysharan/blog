import { expect, test } from "@playwright/test";

test("anonymous access fails closed at the Google operator sign-in", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.STUDIO_E2E_BASE_URL ?? "https://studio-preview.invalid" });
  const page = await context.newPage();
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "OmniLede Studio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await context.close();
});

test("the saved session belongs to the exact configured operator", async ({ page }) => {
  const operator = process.env.STUDIO_E2E_OPERATOR_EMAIL;
  test.skip(!operator || !process.env.STUDIO_E2E_STORAGE_STATE, "A preview operator session is required.");
  await page.goto("/overview");
  await expect(page.getByText(`Signed in as ${operator}`, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/overview$/);
});
