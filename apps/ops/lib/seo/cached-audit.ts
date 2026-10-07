import "server-only";

import { unstable_cache } from "next/cache";

import { auditPublicSite } from "../../../../lib/seo/audit";

export const auditPublicSiteCached = unstable_cache(
  async (origin: string) => auditPublicSite(origin),
  ["omnilede-public-site-audit-v1"],
  { revalidate: 300 },
);
