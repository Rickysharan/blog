import { stageResult, type StageResult } from "./types";

export type TopicCandidate = { id: string; category: string; createdAt: string; similarity: number; title: string };

export function recentSameCategory(candidates: readonly TopicCandidate[], category: string, now = new Date()): readonly TopicCandidate[] {
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000;
  return candidates.filter((candidate) => candidate.category === category && Number.isFinite(Date.parse(candidate.createdAt)) && Date.parse(candidate.createdAt) >= cutoff).sort((a, b) => b.similarity - a.similarity);
}

export function routeDuplicateTopic(candidates: readonly TopicCandidate[], margin = 0.08): StageResult & { leaderId: string | null } {
  if (candidates.length === 0) return { ...stageResult("duplicate_topic", "manual_review", ["duplicate_topic.no_comparison_corpus"]), leaderId: null };
  const [leader, runnerUp] = candidates;
  if (!leader || (runnerUp && leader.similarity - runnerUp.similarity < margin)) return { ...stageResult("duplicate_topic", "manual_review", ["duplicate_topic.no_clear_leader"], leader?.similarity ?? null), leaderId: null };
  if (leader.similarity >= 0.92) return { ...stageResult("duplicate_topic", "manual_review", ["duplicate_topic.high_similarity"], leader.similarity), leaderId: leader.id };
  return { ...stageResult("duplicate_topic", "pass", [], leader.similarity), leaderId: leader.id };
}
