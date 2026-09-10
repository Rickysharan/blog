import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import withSerwistInit from "@serwist/next";

const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision: "omnilede-contributor-offline-v1" }],
  disable: process.env.NODE_ENV !== "production" || !existsSync(new URL("./app/sw.ts", import.meta.url)),
  register: true
});

/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: monorepoRoot,
};

export default withSerwist(nextConfig);
