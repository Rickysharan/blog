import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from "serwist";

export const runtimeCaching = [
  { matcher: ({ sameOrigin, url: { pathname } }: { sameOrigin: boolean; url: { pathname: string } }) => sameOrigin && (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api" || pathname.startsWith("/api/")), handler: new NetworkOnly() },
  { matcher: ({ sameOrigin, request }: { sameOrigin: boolean; request: Request }) => sameOrigin && request.mode === "navigate", handler: new NetworkFirst({ cacheName: "omnilede-contributor-pages", networkTimeoutSeconds: 8 }) },
  { matcher: ({ url: { pathname } }: { url: { pathname: string } }) => /\/_next\/static\/.+|\.(?:css|js|woff2?|ttf|otf)$/i.test(pathname), handler: new StaleWhileRevalidate({ cacheName: "omnilede-contributor-assets" }) }
];
