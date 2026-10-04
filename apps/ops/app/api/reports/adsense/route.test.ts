import { beforeEach, expect, it, vi } from "vitest";

import { AuthorizationError } from "../../../../lib/auth/authorization";

const d = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }));
vi.mock("../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../../lib/providers/adsense", () => ({ fetchAdsenseReport: d.fetch }));

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  d.auth.mockResolvedValue({ userId: "operator" });
  d.fetch.mockResolvedValue({ source: "Google AdSense Management API", range: { start: "2026-09-07", end: "2026-10-04" }, fetchedAt: null, state: "unavailable", data: null });
});

it("authorizes before reading AdSense data", async () => {
  d.auth.mockRejectedValue(new AuthorizationError());
  expect((await GET(new Request("https://studio.example/api/reports/adsense"))).status).toBe(403);
  expect(d.fetch).not.toHaveBeenCalled();
});

it("returns a private no-store report with a bounded range", async () => {
  const response = await GET(new Request("https://studio.example/api/reports/adsense?range=invalid"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(d.fetch).toHaveBeenCalledWith("28d");
});
