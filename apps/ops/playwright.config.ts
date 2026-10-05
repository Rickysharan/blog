import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.STUDIO_E2E_BASE_URL ?? "https://studio-preview.invalid";
const storageState = process.env.STUDIO_E2E_STORAGE_STATE;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    storageState: storageState || undefined,
    trace: "on-first-retry",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "phone-chromium", use: { ...devices["Pixel 7"] }, grep: /@phone|@pwa/ },
  ],
});
