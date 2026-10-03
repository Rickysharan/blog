import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftRepositoryError, validateDraftMdx } from "@omnilede/editorial";
import { makeValidMdx } from "../../../../../../../../packages/editorial/src/test-fixtures";
import { AuthorizationError } from "../../../../../../lib/auth/authorization";
const d = vi.hoisted(() => ({ auth: vi.fn(), factory: vi.fn(), read: vi.fn(), save: vi.fn(), publish: vi.fn(), discard: vi.fn(), append: vi.fn() }));
vi.mock("../../../../../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../../../../../lib/editorial/repository", () => ({ createStudioContentRepository: d.factory }));
vi.mock("../../../../../../lib/publication/history", () => ({ appendPublicationEvent: d.append }));
import { GET, POST } from "./route";
const ref = { category: "anime", filename: "story.mdx" } as const;
const version = "a".repeat(40);
const mdx = makeValidMdx();
const context = { params: Promise.resolve(ref) };
function request(body: unknown, headers = {}) { return new Request("https://studio.example.com/api/content/drafts/anime/story.mdx", { method: "POST", headers: { origin: "https://studio.example.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); }
function body(action = "save") { return { action, mdx, expectedVersion: version, confirmedTitle: "A Valid Editorial Draft", confirmedCategory: "anime" }; }
beforeEach(() => {
  vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" });
  d.factory.mockReturnValue({ read: d.read, save: d.save, publish: d.publish, discard: d.discard });
  d.read.mockResolvedValue({ ref, version, mdx, article: validateDraftMdx(ref, mdx) });
  d.save.mockResolvedValue({ ref, version: "b".repeat(40), mdx });
  d.publish.mockResolvedValue({ articlePath: "content/articles/anime/story.mdx", commitUrl: `https://github.com/owner/repo/commit/${"b".repeat(40)}` });
});
describe("content mutations", () => {
  it("rejects anonymous callers before touching GitHub", async () => {
    d.auth.mockRejectedValue(new AuthorizationError()); expect((await POST(request(body()), context)).status).toBe(403); expect(d.factory).not.toHaveBeenCalled();
  });
  it.each([
    ["origin", body(), { origin: "https://evil.example" }, 403],
    ["media", body(), { "content-type": "text/plain" }, 415],
    ["oversize MDX", { ...body(), mdx: "é".repeat(102401) }, {}, 413],
    ["oversize unused MDX", { ...body("discard"), mdx: "x".repeat(204801) }, {}, 413],
    ["missing version", { action: "save", mdx }, {}, 400],
    ["invalid source", { ...body(), mdx: "invalid" }, {}, 400],
    ["title mismatch", { ...body("publish"), confirmedTitle: "Wrong" }, {}, 400],
    ["category mismatch", { ...body("publish"), confirmedCategory: "movies" }, {}, 400],
    ["missing title", { action: "publish", mdx, expectedVersion: version }, {}, 400],
  ])("rejects %s before GitHub", async (_name, payload, headers, status) => {
    expect((await POST(request(payload, headers as Record<string, string>), context)).status).toBe(status); expect(d.factory).not.toHaveBeenCalled(); expect(d.append).not.toHaveBeenCalled();
  });
  it("rejects invalid refs before GitHub", async () => {
    expect((await POST(request(body()), { params: Promise.resolve({ category: "anime", filename: "../story.mdx" }) })).status).toBe(400); expect(d.factory).not.toHaveBeenCalled();
  });
  it("saves privately and returns the new version with metadata-only history", async () => {
    const response = await POST(request(body()), context); expect(response.status).toBe(200); expect((await response.json()).draft.version).toBe("b".repeat(40));
    expect(d.save).toHaveBeenCalledWith(ref, mdx, version); expect(d.publish).not.toHaveBeenCalled();
    expect(d.append).toHaveBeenCalledWith(expect.objectContaining({ actor_id: "operator", action: "save", content_ref: "anime/story.mdx", prior_version: version, resulting_version: "b".repeat(40) }));
    expect(JSON.stringify(d.append.mock.calls)).not.toContain("reporting0");
  });
  it("publishes exact reviewed bytes with matching confirmation", async () => {
    const reviewed = mdx + "\n\n"; const response = await POST(request({ ...body("publish"), mdx: reviewed }), context);
    expect(response.status).toBe(200); expect(d.publish).toHaveBeenCalledWith(ref, reviewed, version);
    expect((await response.json()).result.articlePath).toBe("content/articles/anime/story.mdx");
  });
  it.each(["save", "publish", "discard"])("maps %s conflicts to 409 without an audit success", async action => {
    d[action as "save"].mockRejectedValue(new DraftRepositoryError("conflict", "changed"));
    const response = await POST(request(body(action)), context); expect(response.status).toBe(409); expect((await response.json()).code).toBe("conflict"); expect(d.append).not.toHaveBeenCalled();
  });
  it("reports committed success with an explicit history warning if history fails", async () => {
    d.append.mockRejectedValue(new Error("secret")); const response = await POST(request(body("publish")), context);
    expect(response.status).toBe(200); const payload = await response.json(); expect(payload.historyWarning).toBeTruthy(); expect(JSON.stringify(payload)).not.toContain("secret");
  });
  it("sanitizes unknown backend errors", async () => {
    d.save.mockRejectedValue(new Error("secret token")); const response = await POST(request(body()), context); expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret token");
  });
  it("reads a draft without publishing and requires authorization", async () => {
    expect((await GET(new Request("https://studio.example.com"), context)).status).toBe(200); expect(d.publish).not.toHaveBeenCalled();
    d.auth.mockRejectedValue(new AuthorizationError()); expect((await GET(new Request("https://studio.example.com"), context)).status).toBe(403);
  });
});
