import { expect, test } from "@playwright/test";

test("keeps responsive image containers sized before they enter the viewport", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const containers = await page.locator('img[src*="anime.svg"]').evaluateAll((images) =>
    images.map((image) => image.parentElement?.getBoundingClientRect().height ?? 0),
  );

  expect(containers).not.toHaveLength(0);
  expect(containers.every((height) => height > 0)).toBe(true);
});
