import { beforeEach, expect, it, vi } from "vitest";

import { AuthorizationError } from "../../../lib/auth/authorization";

const d = vi.hoisted(() => ({ auth: vi.fn(), inventory: vi.fn(), providers: vi.fn(), list: vi.fn(), reconcile: vi.fn(), audit: vi.fn(), warnings: vi.fn() }));
vi.mock("../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../lib/editorial/repository", () => ({ loadStudioEditorialInventory: d.inventory }));
vi.mock("../../../lib/tasks/repository", () => ({ listProviderConnections: d.providers, listTodayTasks: d.list, reconcileTodayTasks: d.reconcile }));
vi.mock("../../../../../lib/seo/audit", () => ({ auditPublicSite: d.audit, siteFindingsToSeoWarnings: d.warnings }));

import { GET, POST } from "./route";

const url = "https://studio.example/api/tasks";
function request(origin = "https://studio.example") {
  return new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ action: "refresh" }) });
}

beforeEach(() => {
  vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" }); d.inventory.mockResolvedValue({ source: "github", items: [] });
  d.providers.mockResolvedValue([]); d.list.mockResolvedValue([]); d.reconcile.mockResolvedValue([]);
  d.audit.mockResolvedValue([{ check: "canonical", state: "warning" }]);
  d.warnings.mockReturnValue([{ code: "site-audit:canonical", url: "https://omnilede-news.netlify.app/story", detail: "Canonical mismatch" }]);
});

it("rejects an anonymous task read before querying task storage", async () => {
  d.auth.mockRejectedValue(new AuthorizationError());
  expect((await GET()).status).toBe(403);
  expect(d.list).not.toHaveBeenCalled();
});

it("refreshes only derived tasks after auth and a same-origin bounded request", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(d.inventory).toHaveBeenCalledOnce(); expect(d.reconcile).toHaveBeenCalledOnce();
  expect(d.audit).toHaveBeenCalledOnce();
  expect(d.reconcile.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ evidenceKey: expect.stringContaining("site-audit%3Acanonical"), kind: "seo" })]));
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("rejects cross-origin and invalid refresh requests before reading content", async () => {
  expect((await POST(request("https://evil.example"))).status).toBe(403);
  expect(d.inventory).not.toHaveBeenCalled();
  const invalid = new Request(url, { method: "POST", headers: { origin: "https://studio.example", "content-type": "application/json" }, body: JSON.stringify({ action: "start-writing" }) });
  expect((await POST(invalid)).status).toBe(400);
  expect(d.inventory).not.toHaveBeenCalled();
});
