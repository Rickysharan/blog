import type { SubmissionInput } from "@omnilede/contracts";
import type { ReviewProviders } from "../providers/types";
import { runQualityGate, runTextSafetyGate } from "./deterministic";
import { routeAutomatedReview } from "./state-machine";
import type { StageResult } from "./types";

export async function runReview(input: SubmissionInput, providers: Pick<ReviewProviders, "classifyText">, options: { firstAuthor: boolean; idempotencyKey: string }): Promise<{ state: ReturnType<typeof routeAutomatedReview>; stages: readonly StageResult[] }> {
  const deterministic = [runQualityGate(input), runTextSafetyGate(input.contentDocument)];
  if (deterministic.some((result) => result.outcome === "reject")) return { state: routeAutomatedReview(deterministic, options.firstAuthor), stages: deterministic };
  const providerResult = await providers.classifyText({ text: JSON.stringify(input.contentDocument).slice(0, 40_000), language: input.language, idempotencyKey: options.idempotencyKey });
  const stages = [...deterministic, providerResult];
  return { state: routeAutomatedReview(stages, options.firstAuthor), stages };
}
