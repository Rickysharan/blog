export type ReviewStage = "quality" | "text_safety" | "image_safety" | "originality" | "duplicate_topic";

export type StageResult = {
  stage: ReviewStage;
  outcome: "pass" | "reject" | "manual_review";
  score: number | null;
  reasons: readonly string[];
  provider: string | null;
  providerVersion: string;
  retryable: boolean;
};

export function stageResult(stage: ReviewStage, outcome: StageResult["outcome"], reasons: readonly string[] = [], score: number | null = null, provider: string | null = null, providerVersion = "deterministic-1", retryable = false): StageResult {
  return { stage, outcome, score, reasons, provider, providerVersion, retryable };
}
