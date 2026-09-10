import type { StageResult } from "./types";

export type SubmissionState = "draft" | "under_review" | "manual_review" | "rejected" | "approved" | "publishing" | "published" | "publishing_failed" | "changes_requested";

const transitions: Record<SubmissionState, readonly SubmissionState[]> = {
  draft: ["under_review"],
  under_review: ["rejected", "manual_review", "approved"],
  manual_review: ["rejected", "approved", "changes_requested"],
  approved: ["publishing"],
  publishing: ["published", "publishing_failed"],
  publishing_failed: ["publishing"],
  rejected: [],
  published: [],
  changes_requested: ["under_review"]
};

export function canTransition(from: SubmissionState, to: SubmissionState): boolean {
  return transitions[from].includes(to);
}

export function transition(from: SubmissionState, to: SubmissionState): SubmissionState {
  if (!canTransition(from, to)) throw new Error(`invalid_transition:${from}:${to}`);
  return to;
}

export function routeAutomatedReview(results: readonly StageResult[], firstAuthor: boolean): SubmissionState {
  if (results.some((result) => result.outcome === "reject")) return "rejected";
  if (firstAuthor || results.some((result) => result.outcome === "manual_review")) return "manual_review";
  return "approved";
}

export function executionKey(submissionId: string, version: number, stage: string): string {
  return `${submissionId}:${version}:${stage}`;
}

export async function runIdempotent<T>(key: string, store: Map<string, T>, operation: () => Promise<T>): Promise<T> {
  const committed = store.get(key);
  if (committed !== undefined) return committed;
  const result = await operation();
  store.set(key, result);
  return result;
}
