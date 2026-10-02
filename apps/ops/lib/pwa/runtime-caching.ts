import { CacheFirst, NetworkOnly, type RuntimeCaching } from "serwist";

const versionedIconPattern = /^\/icons\/studio-(?:icon|maskable)-v\d+\.svg$/;
const versionedNextAssetPattern = /^\/_next\/static\/(?:chunks|css|media)\/.*[a-z0-9]{6,}\.(?:css|js|woff2?|ttf|otf)$/i;

export function isCacheableShellAsset(pathname: string): boolean {
  return versionedIconPattern.test(pathname) || versionedNextAssetPattern.test(pathname);
}

export const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && isCacheableShellAsset(url.pathname),
    handler: new CacheFirst({ cacheName: "omnilede-studio-shell-v1" })
  },
  {
    matcher: ({ sameOrigin }) => sameOrigin,
    handler: new NetworkOnly()
  }
];
