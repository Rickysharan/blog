import { CacheFirst, NetworkOnly } from "serwist";
import { describe, expect, test } from "vitest";

import { isCacheableShellAsset, runtimeCaching } from "./runtime-caching";

function handlerFor(pathname: string, options: { mode?: RequestMode; sameOrigin?: boolean } = {}) {
  const url = new URL(pathname, "https://studio.example");
  const request = { mode: options.mode ?? "cors", url: url.toString() } as Request;
  const entry = runtimeCaching.find(({ matcher }) =>
    typeof matcher === "function"
      ? matcher({
          request,
          url,
          event: {} as FetchEvent,
          sameOrigin: options.sameOrigin ?? true
        })
      : false
  );
  return entry?.handler;
}

describe("Studio PWA runtime caching", () => {
  test.each([
    "/overview",
    "/today",
    "/categories",
    "/content",
    "/growth",
    "/search",
    "/revenue",
    "/health",
    "/login",
    "/auth/callback?code=secret",
    "/api/tasks",
    "/api/content/drafts"
  ])("uses NetworkOnly for private Studio request %s", (pathname) => {
    const mode: RequestMode = pathname.startsWith("/api/") ? "cors" : "navigate";
    expect(handlerFor(pathname, { mode })).toBeInstanceOf(NetworkOnly);
  });

  test.each([
    "/icons/studio-icon-v1.svg",
    "/icons/studio-maskable-v1.svg",
    "/_next/static/chunks/app-4f91a2.js",
    "/_next/static/chunks/app/(studio)/layout-21cce05163651be5.js",
    "/_next/static/css/2c91ef.css"
  ])("uses CacheFirst only for versioned shell asset %s", (pathname) => {
    expect(isCacheableShellAsset(pathname)).toBe(true);
    expect(handlerFor(pathname)).toBeInstanceOf(CacheFirst);
  });

  test.each([
    "/icons/studio-icon.svg",
    "/private-report.json",
    "/content/export.csv",
    "/_next/data/private.json"
  ])("does not admit unversioned or private payload %s to the shell cache", (pathname) => {
    expect(isCacheableShellAsset(pathname)).toBe(false);
    expect(handlerFor(pathname)).not.toBeInstanceOf(CacheFirst);
  });
});
