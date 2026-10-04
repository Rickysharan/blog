import { beforeEach, expect, it, vi } from "vitest";

import { AuthorizationError } from "../../../../../lib/auth/authorization";

const d = vi.hoisted(() => ({ auth: vi.fn(), revoke: vi.fn(), config: vi.fn() }));
vi.mock("../../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../../../lib/google/connections", () => ({ revokeGoogleCredentials: d.revoke }));
vi.mock("../../../../../lib/env", () => ({ parseGoogleOAuthEnv: d.config }));

import { POST } from "./route";

function request(origin = "https://studio.example") {
  return new Request("https://studio.example/api/connections/google/revoke", { method: "POST", headers: { origin } });
}

beforeEach(() => {
  vi.resetAllMocks();
  d.auth.mockResolvedValue({ email: "operator@example.com" });
  d.config.mockReturnValue({ encryptionKey: "server-only-key" });
  d.revoke.mockResolvedValue("disconnected");
});

it("requires exact operator authorization and same-origin before revocation", async () => {
  d.auth.mockRejectedValueOnce(new AuthorizationError("denied"));
  expect((await POST(request())).status).toBe(403);
  expect(d.revoke).not.toHaveBeenCalled();
  d.auth.mockResolvedValue({ email: "operator@example.com" });
  expect((await POST(request("https://evil.example"))).status).toBe(403);
  expect(d.revoke).not.toHaveBeenCalled();
});

it("returns only safe state after successful revocation", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ state: "disconnected" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("reports reconnect-required without deleting editorial state", async () => {
  d.revoke.mockResolvedValue("reconnect-required");
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ state: "unavailable", reconnectRequired: true });
});
