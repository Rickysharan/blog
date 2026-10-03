import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), order: vi.fn(), eq: vi.fn(), in: vi.fn(), insert: vi.fn(), update: vi.fn(), single: vi.fn()
}));
vi.mock("../supabase/server", () => ({ createServiceSupabaseClient: () => ({ from: db.from }) }));

import { completeTask, listTodayTasks, postponeTask, refreshTodayTasks } from "./repository";

const derived = {
  evidenceKey: "coverage:anime:none", kind: "writing" as const, title: "Write Anime", detail: "No article yet.",
  category: "anime" as const, state: "open" as const, priority: 70, source: "editorial", postponedUntil: null, completedAt: null
};

beforeEach(() => {
  vi.resetAllMocks();
  db.from.mockReturnValue(db); db.select.mockReturnValue(db); db.order.mockReturnValue(db); db.eq.mockReturnValue(db); db.single.mockResolvedValue({ data: null, error: null });
  db.in.mockResolvedValue({ data: [], error: null }); db.insert.mockResolvedValue({ error: null }); db.update.mockReturnValue(db);
});

describe("Today task repository", () => {
  it("inserts a new evidence key once and does not reopen completed or postponed rows", async () => {
    db.in.mockResolvedValueOnce({ data: [
      { id: "00000000-0000-4000-8000-000000000001", evidence_key: derived.evidenceKey, state: "completed" },
      { id: "00000000-0000-4000-8000-000000000002", evidence_key: "provider:ga4", state: "postponed" }
    ], error: null });

    await refreshTodayTasks([derived, { ...derived, evidenceKey: "provider:ga4", kind: "provider", category: null }]);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates matching open evidence and inserts only absent keys", async () => {
    db.in.mockResolvedValueOnce({ data: [{ id: "00000000-0000-4000-8000-000000000001", evidence_key: derived.evidenceKey, state: "open" }], error: null });
    db.eq.mockResolvedValue({ error: null });
    await refreshTodayTasks([derived, { ...derived, evidenceKey: "draft:anime:new.mdx", kind: "review" }]);

    expect(db.update).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledWith([expect.objectContaining({ evidence_key: "draft:anime:new.mdx", state: "open" })]);
  });

  it("lists active tasks and writes valid complete and postpone state transitions", async () => {
    db.order.mockResolvedValueOnce({ data: [], error: null });
    await expect(listTodayTasks()).resolves.toEqual([]);
    db.single.mockResolvedValue({ data: {
      id: "00000000-0000-4000-8000-000000000001", evidence_key: derived.evidenceKey, kind: "writing", title: "Write Anime", detail: "No article yet.", category: "anime", state: "completed", priority: 70, source: "editorial", postponed_until: null, completed_at: "2026-10-03T12:00:00.000Z", created_at: "2026-10-03T10:00:00.000Z", updated_at: "2026-10-03T12:00:00.000Z"
    }, error: null });
    await completeTask("00000000-0000-4000-8000-000000000001", new Date("2026-10-03T12:00:00.000Z"));
    expect(db.update).toHaveBeenCalledWith({ state: "completed", completed_at: "2026-10-03T12:00:00.000Z", postponed_until: null });
    expect(db.eq).toHaveBeenCalledWith("state", "open");
    await postponeTask("00000000-0000-4000-8000-000000000001", "2026-10-04T12:00:00.000Z");
    expect(db.update).toHaveBeenCalledWith({ state: "postponed", completed_at: null, postponed_until: "2026-10-04T12:00:00.000Z" });
  });
});
