import { expect, settleConsent, test } from "./fixtures";

test("serves the install manifest, offline fallback, and install-ready metadata", async ({ page }) => {
  await page.goto("/");
  await settleConsent(page);

  const manifestResponse = await page.request.get("/manifest.json");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192" }),
    expect.objectContaining({ sizes: "512x512" }),
    expect.objectContaining({ purpose: "maskable" }),
  ]));

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: /signal will return/i })).toBeVisible();
  await expect(page.locator("link[rel='manifest']")).toHaveAttribute("href", "/manifest.json");
});
