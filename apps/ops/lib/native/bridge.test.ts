import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NATIVE_STATUS_EVENT,
  NATIVE_PLAN_EVENT,
  hasNativeWriter,
  postNativeAction,
  readNativeStatus,
  readNativePlanSnapshot,
} from "./bridge";

declare global {
  interface Window {
    __OMNILEDE_NATIVE__?: { available: true };
    webkit?: { messageHandlers?: { omnilede?: { postMessage(message: unknown): void } } };
  }
}

beforeEach(() => {
  delete window.__OMNILEDE_NATIVE__;
  delete window.webkit;
});

describe("native writer bridge", () => {
  it("stays unavailable in an ordinary browser even if page script imitates a handler", () => {
    window.webkit = { messageHandlers: { omnilede: { postMessage: vi.fn() } } };
    expect(hasNativeWriter()).toBe(false);
    expect(postNativeAction({ action: "write", category: "sports", requestId: "request-12345678" })).toBe(false);
  });

  it("posts only supported activated messages through the injected capability", () => {
    const postMessage = vi.fn();
    window.__OMNILEDE_NATIVE__ = { available: true };
    window.webkit = { messageHandlers: { omnilede: { postMessage } } };
    expect(postNativeAction({ action: "write", category: "share-market", requestId: "request-12345678" })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ action: "write", category: "share-market", requestId: "request-12345678" });
    expect(() => postNativeAction({ action: "write", category: "technology" as never, requestId: "request-12345678" })).toThrow(/category/i);
    expect(() => postNativeAction({ action: "write", category: "sports", requestId: "short" })).toThrow(/request/i);
  });

  it("accepts only sanitized status fields from the native event", () => {
    const event = new CustomEvent(NATIVE_STATUS_EVENT, { detail: {
      category: "anime", requestId: "request-12345678", phase: "generation", progress: 42,
      etaSeconds: 18, delivery: "pending", error: null, token: "secret", body: "article"
    } });
    expect(readNativeStatus(event)).toEqual({
      category: "anime", requestId: "request-12345678", phase: "generation", progress: 42,
      etaSeconds: 18, delivery: "pending", error: null
    });
    expect(readNativeStatus(new CustomEvent(NATIVE_STATUS_EVENT, { detail: {
      category: "anime", requestId: "request-12345678", phase: "generation", progress: 42,
      etaSeconds: 86_401, delivery: "pending", error: null,
    } }))).toBeNull();
    expect(readNativeStatus(new CustomEvent(NATIVE_STATUS_EVENT, { detail: {
      category: "anime", requestId: "request-12345678", phase: "failed", progress: 42,
      etaSeconds: null, delivery: "not-delivered", error: "x".repeat(201),
    } }))).toBeNull();
  });

  it("accepts only a bounded three-task native planner snapshot", () => {
    const detail = {
      requestId: "refresh-12345678", date: "2026-10-03", completedCount: 1, totalTasks: 3,
      draftCount: 2, publishedCount: 24,
      tasks: [
        { category: "anime", label: "Anime", reason: "Least recent coverage", status: "todo" },
        { category: "sports", label: "Sports", reason: "Draft waiting for review", status: "draft-ready" },
        { category: "finance", label: "Finance", reason: "Saved work needs attention", status: "needs-attention" },
      ],
    };
    expect(readNativePlanSnapshot(new CustomEvent(NATIVE_PLAN_EVENT, { detail }))).toEqual(detail);
    expect(readNativePlanSnapshot(new CustomEvent(NATIVE_PLAN_EVENT, { detail: { ...detail, totalTasks: 4 } }))).toBeNull();
    expect(readNativePlanSnapshot(new CustomEvent(NATIVE_PLAN_EVENT, { detail: { ...detail, tasks: [...detail.tasks, detail.tasks[0]] } }))).toBeNull();
    expect(readNativePlanSnapshot(new CustomEvent(NATIVE_PLAN_EVENT, { detail: { ...detail, tasks: [{ ...detail.tasks[0], category: "technology" }, ...detail.tasks.slice(1)] } }))).toBeNull();
  });

  it("validates an optional exact plan date without requiring it for Categories writes", () => {
    const postMessage = vi.fn();
    window.__OMNILEDE_NATIVE__ = { available: true };
    window.webkit = { messageHandlers: { omnilede: { postMessage } } };
    expect(postNativeAction({ action: "write", category: "sports", requestId: "category-12345678" })).toBe(true);
    expect(postNativeAction({ action: "write", category: "anime", planDate: "2026-10-03", requestId: "plan-write-12345" })).toBe(true);
    expect(() => postNativeAction({ action: "write", category: "anime", planDate: "2026-02-30", requestId: "bad-date-123456" })).toThrow(/plan date/i);
  });
});
