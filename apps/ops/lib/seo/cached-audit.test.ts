import { expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({
  audit: vi.fn(),
  cacheOptions: undefined as { revalidate?: number } | undefined,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: (origin: string) => Promise<unknown>, _keyParts: string[], options: { revalidate?: number }) => {
    d.cacheOptions = options;
    return callback;
  },
}));
vi.mock("../../../../lib/seo/audit", () => ({ auditPublicSite: d.audit }));

import { auditPublicSiteCached } from "./cached-audit";

it("reuses public-site audits for five minutes", async () => {
  d.audit.mockResolvedValue([{ check: "canonical", state: "pass" }]);

  await expect(auditPublicSiteCached("https://news.example")).resolves.toEqual([
    { check: "canonical", state: "pass" },
  ]);
  expect(d.audit).toHaveBeenCalledWith("https://news.example");
  expect(d.cacheOptions).toEqual({ revalidate: 300 });
});
