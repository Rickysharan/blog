import { beforeEach, expect, it, vi } from "vitest";
import { AuthorizationError } from "../../../../lib/auth/authorization";
const d = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }));
vi.mock("../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../../lib/providers/ga4", () => ({ fetchGa4Report: d.fetch }));
import { GET } from "./route";
beforeEach(() => { vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" }); d.fetch.mockResolvedValue({ source: "GA4", range: { start: "2026-10-01", end: "2026-10-04" }, fetchedAt: null, state: "unavailable", data: null }); });
it("authorizes before fetching GA4", async () => { d.auth.mockRejectedValue(new AuthorizationError()); expect((await GET(new Request("https://studio.example/api/reports/ga4"))).status).toBe(403); expect(d.fetch).not.toHaveBeenCalled(); });
it("returns a private report and bounded preset", async () => { const response = await GET(new Request("https://studio.example/api/reports/ga4?range=invalid")); expect(response.headers.get("cache-control")).toContain("no-store"); expect(d.fetch).toHaveBeenCalledWith("28d"); });
