import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3200",
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build --workspace @omnilede/contributor && npm run start --workspace @omnilede/contributor -- -p 3200",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
      NEXT_PUBLIC_BLOG_URL: "https://blog.example",
      NEXT_PUBLIC_CONTRIBUTOR_URL: "http://127.0.0.1:3200",
      SUPABASE_SECRET_KEY: "sb_secret_e2e_only_for_browser_tests",
      REDEMPTIONS_ENABLED: "false",
      ALLOW_FUNDED_REDEMPTIONS: "false",
      AUTH_ALLOWED_ORIGINS: "http://127.0.0.1:3200",
      ADMIN_PASSWORD: "e2e-admin-password-123",
      ADMIN_SESSION_SECRET: "e2e-session-secret-that-is-at-least-32-characters-long"
    },
    url: "http://127.0.0.1:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
