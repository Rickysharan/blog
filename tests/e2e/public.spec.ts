import { expect, settleConsent, test } from "./fixtures";

test("reader can browse every desk and open an attributed article", async ({ page }) => {
  await page.goto("/");
  await settleConsent(page);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

  for (const desk of [
    { label: "Anime", href: "/category/anime" },
    { label: "Movies", href: "/category/movies" },
    { label: "Politics", href: "/category/politics" },
    { label: "Sports", href: "/category/sports" },
    { label: "Finance", href: "/category/finance" },
    { label: "Share Market", href: "/category/share-market" },
  ]) {
    await expect(
      page.getByRole("link", { name: desk.label, exact: true }).first(),
    ).toHaveAttribute("href", desk.href);
  }

  await page.locator("h1 a").click();
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
