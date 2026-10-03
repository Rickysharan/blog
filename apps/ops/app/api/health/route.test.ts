import { beforeEach, expect, it, vi } from "vitest";
import { AuthorizationError } from "../../../lib/auth/authorization";
const d = vi.hoisted(() => ({ auth: vi.fn(), collect: vi.fn() }));
vi.mock("../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../lib/health/site-health", () => ({ collectSiteHealth: d.collect }));
import { GET } from "./route";
beforeEach(() => { vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" }); d.collect.mockResolvedValue([]); });
it("requires the active operator before health probes", async () => {
  d.auth.mockRejectedValue(new AuthorizationError()); expect((await GET()).status).toBe(403); expect(d.collect).not.toHaveBeenCalled();
});
it("returns non-cacheable evidence-backed findings", async () => {
  const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.json()).toEqual({ findings: [] });
});
