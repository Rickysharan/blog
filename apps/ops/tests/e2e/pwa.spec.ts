import { expect, test } from "@playwright/test";

test("@pwa exposes an installable owned manifest", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "OmniLede Studio", display: "standalone", start_url: "/overview" });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/studio-icon-v1.svg", purpose: "any" }),
    expect.objectContaining({ src: "/icons/studio-maskable-v1.svg", purpose: "maskable" }),
  ]));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
});

test("@pwa does not serve private navigation from an offline cache", async ({ page, context }) => {
  test.skip(!process.env.STUDIO_E2E_STORAGE_STATE, "A preview operator session is required.");
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.goto("/content", { waitUntil: "domcontentloaded", timeout: 10_000 })).rejects.toThrow();
  await context.setOffline(false);
});
