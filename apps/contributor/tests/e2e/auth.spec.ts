import { expect, test } from "@playwright/test";

test.describe("contributor authentication shell", () => {
  test("renders accessible sign-up and recovery entry points", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create your contributor account/i })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute("minlength", "12");

    await page.getByRole("link", { name: /already have an account/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("link", { name: /forgot your password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("keeps a hostile next parameter out of the sign-in destination", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example");
    await page.getByLabel("Email address").fill("reader@example.com");
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/evil\.example/);
  });
});
