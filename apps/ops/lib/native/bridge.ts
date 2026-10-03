import { isCategorySlug, type CategorySlug } from "@omnilede/editorial/categories";

export const NATIVE_STATUS_EVENT = "omnilede:native-status";

declare global {
  interface Window {
    __OMNILEDE_NATIVE__?: { available: true };
    webkit?: { messageHandlers?: { omnilede?: { postMessage(message: unknown): void } } };
  }
}

export type NativeAction =
  | { action: "write"; category: CategorySlug; requestId: string }
  | { action: "cancel" | "refresh"; requestId: string };

export interface NativeWriterStatus {
  category: CategorySlug;
  requestId: string;
  phase: string;
  progress: number;
  etaSeconds: number | null;
  delivery: "pending" | "delivered" | "not-delivered";
  error: string | null;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const phasePattern = /^[a-z][a-z0-9-]{0,63}$/;

export function hasNativeWriter(): boolean {
  return typeof window !== "undefined"
    && window.__OMNILEDE_NATIVE__?.available === true
    && typeof window.webkit?.messageHandlers?.omnilede?.postMessage === "function";
}

export function postNativeAction(action: NativeAction): boolean {
  if (!requestIdPattern.test(action.requestId)) throw new Error("A valid native request ID is required.");
  if (action.action === "write" && !isCategorySlug(action.category)) throw new Error("A supported category is required.");
  if (!hasNativeWriter()) return false;
  window.webkit!.messageHandlers!.omnilede!.postMessage(action);
  return true;
}

export function readNativeStatus(event: Event): NativeWriterStatus | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return null;
  const value = event.detail as Record<string, unknown>;
  if (
    typeof value.category !== "string" || !isCategorySlug(value.category)
    || typeof value.requestId !== "string" || !requestIdPattern.test(value.requestId)
    || typeof value.phase !== "string" || !phasePattern.test(value.phase)
    || typeof value.progress !== "number" || !Number.isInteger(value.progress) || value.progress < 0 || value.progress > 100
    || !(value.etaSeconds === null || (typeof value.etaSeconds === "number" && Number.isInteger(value.etaSeconds) && value.etaSeconds >= 0 && value.etaSeconds <= 86_400))
    || !["pending", "delivered", "not-delivered"].includes(String(value.delivery))
    || !(value.error === null || (typeof value.error === "string" && value.error.length <= 200))
  ) return null;
  return {
    category: value.category,
    requestId: value.requestId,
    phase: value.phase,
    progress: value.progress,
    etaSeconds: value.etaSeconds,
    delivery: value.delivery as NativeWriterStatus["delivery"],
    error: value.error,
  };
}
