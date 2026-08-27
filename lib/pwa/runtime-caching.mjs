import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from "serwist";
import { defaultCache } from "@serwist/next/worker";

/**
 * Runtime routes are ordered from the most sensitive to the broadest. The
 * final Next.js defaults preserve RSC/data/font behavior without ever
 * superseding the explicit admin/API exclusions above.
 */
export const runtimeCaching = [
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && (pathname === "/admin" || pathname.startsWith("/admin/")),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && (pathname === "/api" || pathname.startsWith("/api/")),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: "omnilede-pages",
      networkTimeoutSeconds: 8,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  {
    matcher: ({ sameOrigin, request, url: { pathname } }) =>
      sameOrigin && request.destination === "image" && pathname.startsWith("/images/articles/"),
    handler: new CacheFirst({
      cacheName: "omnilede-article-images",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  {
    matcher: ({ url: { pathname } }) =>
      /\/_next\/static\/.+|\.(?:css|js|woff2?|ttf|otf)$/i.test(pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "omnilede-static-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  ...defaultCache,
];
