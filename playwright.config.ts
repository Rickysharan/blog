import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: "npm run dev -- -H 127.0.0.1 -p 3100",
    env: {
      ADMIN_PASSWORD: "e2e-admin-password-123",
      ADMIN_SESSION_SECRET: "e2e-session-secret-that-is-at-least-32-characters-long",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
