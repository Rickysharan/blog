import { expect, settleConsent, test } from "./fixtures";

test("reader can browse every desk and open an attributed article", async ({ page }) => {
  await page.goto("/");
  await settleConsent(page);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.getByRole("banner").hover();

  for (const desk of [
    { label: "Anime", href: "/category/anime" },
    { label: "Movies", href: "/category/movies" },
    { label: "Politics", href: "/category/politics" },
    { label: "Sports", href: "/category/sports" },
    { label: "Finance", href: "/category/finance" },
    { label: "Share Market", href: "/category/share-market" },
    { label: "Top 10", href: "/category/top-10" },
  ]) {
    await expect(
      page.getByRole("link", { name: desk.label, exact: true }).first(),
    ).toHaveAttribute("href", desk.href);
  }

  await page.locator("h1 a").click();
  await expect(page).toHaveURL(/\/article\//);
  await expect(page.getByRole("heading", { name: /.+/ }).first()).toBeVisible();
  await expect(page.locator("article p").filter({ hasText: /^Source:/ })).toBeVisible();
});

test("category archives keep the global desk navigation available", async ({ page }, testInfo) => {
  await page.goto("/category/politics");
  await settleConsent(page);
  await expect(page.getByRole("heading", { name: "Politics", exact: true })).toBeVisible();
  if (testInfo.project.name === "mobile-chrome") {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Anime", exact: true })).toBeVisible();
    return;
  }
  await page.getByRole("banner").hover();
  await expect(page.locator("#desktop-news-desks")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#desktop-news-desks").getByRole("link", { name: "Anime", exact: true })).toBeVisible();
});

test("desktop desk strip reveals without shifting content and can be pinned", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chrome", "Desktop navigation is replaced by the touch menu on phones.");
  await page.goto("/");
  await settleConsent(page);
  const desks = page.locator("#desktop-news-desks");
  const firstHeading = page.getByRole("main").getByRole("heading").first();
  const before = await firstHeading.boundingBox();
  await expect(desks).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("banner").hover();
  await expect(desks).toHaveAttribute("aria-hidden", "false");
  expect((await firstHeading.boundingBox())?.y).toBe(before?.y);
  await page.locator('button[aria-controls="desktop-news-desks"]').click();
  await page.getByRole("main").hover();
  await expect(desks).toHaveAttribute("aria-hidden", "false");
  await page.keyboard.press("Escape");
  await expect(desks).toHaveAttribute("aria-hidden", "true");
});
