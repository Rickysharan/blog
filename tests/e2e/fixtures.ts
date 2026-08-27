import { expect, test as base, type Page } from "@playwright/test";

export const test = base;
export { expect };

export async function settleConsent(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /accept optional cookies/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}
