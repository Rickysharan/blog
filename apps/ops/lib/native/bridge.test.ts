import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NATIVE_STATUS_EVENT,
  hasNativeWriter,
  postNativeAction,
  readNativeStatus,
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
});
