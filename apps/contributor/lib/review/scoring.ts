import { normalizeContent } from "./deterministic";

export type ReviewScores = {
  originality: number;
  sourcedFactualDensity: number;
  structure: number;
  wordBandFit: number;
};

export function calculateReviewScore(scores: ReviewScores): number {
  const canonical = JSON.parse(normalizeContent(scores)) as ReviewScores;
  const weighted = canonical.originality * 0.35 + canonical.sourcedFactualDensity * 0.25 + canonical.structure * 0.2 + canonical.wordBandFit * 0.2;
  return Math.round(Math.max(0, Math.min(1, weighted)) * 10_000) / 10_000;
}
