import { expect, test } from "@playwright/test";

test.beforeEach(() => {
  test.skip(!process.env.STUDIO_E2E_STORAGE_STATE, "A preview operator session is required.");
});

test("shows source-backed overview cards and separate Today and Categories pages", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("GitHub content", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Google Analytics", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Google Search Console", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Google AdSense", { exact: false }).first()).toBeVisible();

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categories" })).toHaveCount(0);

  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(7);
});

test("keeps unavailable provider data explicit across insight pages", async ({ page }) => {
  for (const [path, heading] of [["/growth", "Growth"], ["/search", "Search"], ["/revenue", "Revenue"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText(/Unavailable|Disconnected|Connected|Delayed|Stale/i).first()).toBeVisible();
  }
});

test("@phone keeps all newsroom destinations reachable on a phone viewport", async ({ page }) => {
  await page.goto("/overview");
  const navigation = page.getByRole("navigation", { name: "Studio phone navigation" });
  await expect(navigation).toBeVisible();
  for (const name of ["Overview", "Today", "Categories", "Content", "Growth", "Google Search", "Revenue", "Site health", "Connections"]) {
    await expect(navigation.getByRole("link", { name })).toBeVisible();
  }
});
