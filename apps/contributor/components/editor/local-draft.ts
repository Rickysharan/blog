import type { SubmissionSave } from "@omnilede/contracts";

export type LocalDraft = {
  savedAt: string;
  expectedVersion: number;
  payload: Omit<SubmissionSave, "expectedVersion" | "submit">;
};

function storageKey(userId: string, submissionId: string): string {
  return `omnilede:contributor:draft:${userId}:${submissionId}`;
}

export function saveLocalDraft(userId: string, submissionId: string, draft: LocalDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId, submissionId), JSON.stringify(draft));
}

export function restoreLocalDraft(userId: string, submissionId: string): LocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId, submissionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Partial<LocalDraft>;
    if (typeof draft.savedAt !== "string" || typeof draft.expectedVersion !== "number" || !draft.payload || typeof draft.payload !== "object") return null;
    return draft as LocalDraft;
  } catch {
    return null;
  }
}

export function clearLocalDraft(userId: string, submissionId: string): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(storageKey(userId, submissionId));
}
