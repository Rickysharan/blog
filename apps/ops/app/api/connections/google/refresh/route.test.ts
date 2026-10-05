import { beforeEach, expect, it, vi } from "vitest";

import { AuthorizationError } from "../../../../../lib/auth/authorization";

const d = vi.hoisted(() => ({ auth: vi.fn(), refresh: vi.fn(), list: vi.fn() }));
vi.mock("../../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../../../lib/google/resource-discovery", () => ({ refreshGoogleResources: d.refresh }));
vi.mock("../../../../../lib/google/connections", () => ({ listGoogleConnections: d.list }));

import { POST } from "./route";

const request = (origin = "https://studio.example") => new Request("https://studio.example/api/connections/google/refresh", { method: "POST", headers: { origin } });

beforeEach(() => {
  vi.resetAllMocks();
  d.auth.mockResolvedValue({ email: "operator@example.com" });
  d.refresh.mockResolvedValue([{ provider: "google-analytics", status: "empty", resourceId: null }]);
  d.list.mockResolvedValue([]);
});

it("requires the operator and an exact same-origin request", async () => {
  d.auth.mockRejectedValueOnce(new AuthorizationError("denied"));
  expect((await POST(request())).status).toBe(403);
  expect(d.refresh).not.toHaveBeenCalled();
  d.auth.mockResolvedValue({ email: "operator@example.com" });
  expect((await POST(request("https://evil.example"))).status).toBe(403);
  expect(d.refresh).not.toHaveBeenCalled();
});

it("returns safe discovery results and refreshed connection cards", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    results: [{ provider: "google-analytics", status: "empty", resourceId: null }],
    connections: []
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
