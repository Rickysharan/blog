import { expect, test } from "@playwright/test";

test("publishes complete legal and partner-facing routes", async ({ page }) => {
  const routes = [
    ["/privacy", "Respect for the reader."],
    ["/terms", "Clear terms for useful work."],
    ["/advertise", "Reach a curious global audience."],
    ["/disclaimer", "Context is not certainty."],
    ["/contact", "Reach the OmniLede desk."]
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await page.goto("/privacy");
  await expect(page.getByText("[FILL IN: LEGAL OPERATOR NAME]")).toBeVisible();
  await expect(page.getByText("[FILL IN: REGISTERED ADDRESS]")).toBeVisible();
  await expect(page.getByText("[FILL IN: PRIVACY EMAIL]")).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByText("[FILL IN: LEGAL OPERATOR NAME]", { exact: false }).first()).toBeVisible();
  await page.goto("/disclaimer");
  await expect(page.getByText("[FILL IN: TAX/GST DETAILS]")).toBeVisible();
  await expect(page.getByText("[FILL IN: FINAL PAYOUT PROCESSOR]")).toBeVisible();
});

test("exposes an installable manifest, owned icons, and a clear offline shell", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("OmniLede Contributor");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", purpose: "maskable" })
  ]));
  expect((await request.get("/icons/icon-192.png")).ok()).toBe(true);
  expect((await request.get("/icons/icon-512.png")).ok()).toBe(true);

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "Your desk is waiting." })).toBeVisible();
  await expect(page.getByText(/Reconnect before saving a draft/i)).toBeVisible();
});

test("renders the contact outbox form with separate commercial routes", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByLabel("Enquiry type")).toBeVisible();
  await expect(page.getByRole("option", { name: "Advertising" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Partnership" })).toHaveCount(1);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send enquiry" })).toBeVisible();
});
