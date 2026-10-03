import { beforeEach, expect, it, vi } from "vitest";
import { AuthorizationError } from "../../../../lib/auth/authorization";
const dependencies = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), history: vi.fn() }));
vi.mock("../../../../lib/auth/operator", () => ({ requireStudioOperator: dependencies.auth }));
vi.mock("../../../../lib/editorial/repository", () => ({ createStudioContentRepository: () => ({ list: dependencies.list }) }));
vi.mock("../../../../lib/publication/history", () => ({ listPublicationHistory: dependencies.history }));
import { GET } from "./route";
beforeEach(() => { vi.resetAllMocks(); dependencies.auth.mockResolvedValue({ userId: "operator" }); dependencies.list.mockResolvedValue([]); dependencies.history.mockResolvedValue([]); });
it("rejects anonymous sessions before accessing content or history", async () => {
  dependencies.auth.mockRejectedValue(new AuthorizationError());
  expect((await GET()).status).toBe(403);
  expect(dependencies.list).not.toHaveBeenCalled(); expect(dependencies.history).not.toHaveBeenCalled();
});
it("returns a private non-cacheable list with history and no mutation", async () => {
  const response = await GET(); expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ drafts: [], history: [] });
});
