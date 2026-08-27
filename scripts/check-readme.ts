import { promises as fs } from "node:fs";

const required = [
  "vercel logout",
  "brand-new Vercel account",
  "different email",
  "brand-new project",
  "ANTHROPIC_API_KEY",
  "GA4_ID",
  "ADSENSE_CLIENT_ID",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "STOCK_API_KEY",
  "GITHUB_TOKEN",
  ".vercel.app",
  "Hobby",
  "non-commercial",
  "optional Claude",
  "GitHub Actions",
  "Vercel Cron",
];

const readme = await fs.readFile(new URL("../README.md", import.meta.url), "utf8").catch(() => "");
const missing = required.filter((term) => !readme.toLocaleLowerCase().includes(term.toLocaleLowerCase()));

if (missing.length > 0) {
  console.error(`README verification failed. Missing: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`README verification passed (${required.length} required markers).`);
}
