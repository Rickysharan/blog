import { isCategorySlug, type CategorySlug } from "@omnilede/editorial/categories";

export const NATIVE_STATUS_EVENT = "omnilede:native-status";
export const NATIVE_PLAN_EVENT = "omnilede:native-plan";

declare global {
  interface Window {
    __OMNILEDE_NATIVE__?: { available: true };
    webkit?: { messageHandlers?: { omnilede?: { postMessage(message: unknown): void } } };
  }
}

export type NativeAction =
  | { action: "write"; category: CategorySlug; requestId: string; planDate?: string }
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

const planStatuses = ["todo", "writing", "draft-ready", "published", "needs-attention"] as const;
export interface NativePlanSnapshot {
  requestId: string;
  date: string;
  completedCount: number;
  totalTasks: 3;
  draftCount: number;
  publishedCount: number;
  tasks: Array<{
    category: CategorySlug;
    label: string;
    reason: string;
    status: (typeof planStatuses)[number];
  }>;
}

export const NATIVE_PLAN_REFRESH_ERROR = "Daily plan could not be refreshed. Try again.";
export interface NativePlanFailure {
  requestId: string;
  status: "error";
  error: typeof NATIVE_PLAN_REFRESH_ERROR;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const phasePattern = /^[a-z][a-z0-9-]{0,63}$/;
const validPlanDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

export function hasNativeWriter(): boolean {
  return typeof window !== "undefined"
    && window.__OMNILEDE_NATIVE__?.available === true
    && typeof window.webkit?.messageHandlers?.omnilede?.postMessage === "function";
}

export function postNativeAction(action: NativeAction): boolean {
  if (!requestIdPattern.test(action.requestId)) throw new Error("A valid native request ID is required.");
  if (action.action === "write" && !isCategorySlug(action.category)) throw new Error("A supported category is required.");
  if (action.action === "write" && action.planDate !== undefined && !validPlanDate(action.planDate)) throw new Error("A valid plan date is required.");
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

export function readNativePlanSnapshot(event: Event): NativePlanSnapshot | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return null;
  const value = event.detail as Record<string, unknown>;
  const tasks = value.tasks;
  const validDate = typeof value.date === "string" && validPlanDate(value.date);
  const validCount = (candidate: unknown) => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0;
  if (!requestIdPattern.test(String(value.requestId ?? "")) || !validDate
    || !validCount(value.completedCount) || value.totalTasks !== 3 || !validCount(value.draftCount) || !validCount(value.publishedCount)
    || !Array.isArray(tasks) || tasks.length !== 3 || (value.completedCount as number) > 3) return null;
  const categories = new Set<string>();
  for (const candidate of tasks) {
    if (!candidate || typeof candidate !== "object") return null;
    const task = candidate as Record<string, unknown>;
    if (typeof task.category !== "string" || !isCategorySlug(task.category) || categories.has(task.category)
      || typeof task.label !== "string" || task.label.length < 1 || task.label.length > 80
      || typeof task.reason !== "string" || task.reason.length < 1 || task.reason.length > 300
      || typeof task.status !== "string" || !planStatuses.includes(task.status as NativePlanSnapshot["tasks"][number]["status"])) return null;
    categories.add(task.category);
  }
  return {
    requestId: value.requestId as string,
    date: value.date as string,
    completedCount: value.completedCount as number,
    totalTasks: 3,
    draftCount: value.draftCount as number,
    publishedCount: value.publishedCount as number,
    tasks: tasks as NativePlanSnapshot["tasks"],
  };
}

export function readNativePlanFailure(event: Event): NativePlanFailure | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return null;
  const value = event.detail as Record<string, unknown>;
  if (!requestIdPattern.test(String(value.requestId ?? ""))
    || value.status !== "error" || value.error !== NATIVE_PLAN_REFRESH_ERROR) return null;
  return { requestId: value.requestId as string, status: "error", error: NATIVE_PLAN_REFRESH_ERROR };
}
