import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock("../supabase/server", () => ({ createServiceSupabaseClient: () => ({ from: db.from }) }));
import { appendPublicationEvent, listPublicationHistory } from "./history";
beforeEach(() => { vi.resetAllMocks(); db.from.mockReturnValue(db); db.select.mockReturnValue(db); db.order.mockReturnValue(db); db.limit.mockResolvedValue({ data: [], error: null }); db.insert.mockResolvedValue({ error: null }); });
it("inserts only audit metadata even if callers carry extra article bytes and tokens", async () => {
  const event = { actor_id: "actor", action: "publish" as const, category: "anime" as const, content_ref: "anime/story.mdx", prior_version: "a", resulting_version: "b", commit_url: "https://github.com/owner/repo/commit/b", created_at: "2026-10-03T00:00:00Z", mdx: "private body", token: "private token" };
  await appendPublicationEvent(event); expect(db.from).toHaveBeenCalledWith("publication_events"); expect(db.insert).toHaveBeenCalledWith({ actor_id: "actor", action: "publish", category: "anime", content_ref: "anime/story.mdx", prior_version: "a", resulting_version: "b", commit_url: "https://github.com/owner/repo/commit/b", created_at: "2026-10-03T00:00:00Z" });
});
it("reads a bounded newest-first history and sanitizes provider errors", async () => {
  expect(await listPublicationHistory()).toEqual([]); expect(db.order).toHaveBeenCalledWith("created_at", { ascending: false }); expect(db.limit).toHaveBeenCalledWith(100);
  db.limit.mockResolvedValue({ error: new Error("secret") }); await expect(listPublicationHistory()).rejects.toThrow("Publication history unavailable");
});
