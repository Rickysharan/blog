export type ReputationInput = { approved: number; rejected: number; changesRequested: number; engagement: number | null };
export type ReputationResult = { score: number; tier: "New" | "Trusted" | "Verified"; engagement: number | null; engagementStatus: "available" | "unavailable" };

export function calculateReputation(input: ReputationInput): ReputationResult {
  const total = input.approved + input.rejected + input.changesRequested;
  const approvalRate = total === 0 ? 0 : input.approved / total;
  const score = Math.max(0, Math.round(approvalRate * 700 + Math.min(input.approved, 20) * 15 - input.rejected * 10 - input.changesRequested * 2));
  const tier = score >= 700 && input.approved >= 10 ? "Verified" : score >= 350 && input.approved >= 3 ? "Trusted" : "New";
  return { score, tier, engagement: input.engagement, engagementStatus: input.engagement === null ? "unavailable" : "available" };
}
