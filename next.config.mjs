import { existsSync } from "node:fs";
import withSerwistInit from "@serwist/next";

const serviceWorkerSource = new URL("./app/sw.ts", import.meta.url);
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision: "omnilede-offline-v1" }],
  disable:
    process.env.NODE_ENV !== "production" || !existsSync(serviceWorkerSource),
  register: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "m.media-amazon.com" }
    ]
  }
};

export default withSerwist(nextConfig);
