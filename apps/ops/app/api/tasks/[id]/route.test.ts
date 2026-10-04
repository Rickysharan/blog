import { beforeEach, expect, it, vi } from "vitest";

import { AuthorizationError } from "../../../../lib/auth/authorization";

const d = vi.hoisted(() => ({ auth: vi.fn(), complete: vi.fn(), postpone: vi.fn() }));
vi.mock("../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../../lib/tasks/repository", () => ({ completeTask: d.complete, postponeTask: d.postpone }));
import { PATCH } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };
function request(body: unknown, origin = "https://studio.example") {
  return new Request(`https://studio.example/api/tasks/${id}`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" }); d.complete.mockResolvedValue({ id }); d.postpone.mockResolvedValue({ id }); });

it("authenticates before changing a task", async () => {
  d.auth.mockRejectedValue(new AuthorizationError());
  expect((await PATCH(request({ action: "complete" }), context)).status).toBe(403);
  expect(d.complete).not.toHaveBeenCalled();
});

it("completes and postpones a valid task through same-origin requests", async () => {
  expect((await PATCH(request({ action: "complete" }), context)).status).toBe(200);
  expect(d.complete).toHaveBeenCalledWith(id);
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const postponeResponse = await PATCH(request({ action: "postpone", postponedUntil: until }), context);
  expect(postponeResponse.status).toBe(200);
  expect(d.postpone).toHaveBeenCalledWith(id, until);
});

it("rejects invalid ids, origins and action bodies before mutation", async () => {
  expect((await PATCH(request({ action: "complete" }), { params: Promise.resolve({ id: "not-an-id" }) })).status).toBe(400);
  expect((await PATCH(request({ action: "complete" }, "https://evil.example"), context)).status).toBe(403);
  expect((await PATCH(request({ action: "postpone" }), context)).status).toBe(400);
  expect(d.complete).not.toHaveBeenCalled(); expect(d.postpone).not.toHaveBeenCalled();
});
