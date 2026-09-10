export type RewardRule = { id: string; category: string; minWords: number; maxWords: number; points: number; effectiveFrom: string; effectiveTo: string | null };

export function calculateReward(input: { category: string; wordCount: number; approvedAt: string }, rules: readonly RewardRule[]): RewardRule | null {
  const at = Date.parse(input.approvedAt);
  return rules.filter((rule) => (rule.category === input.category || rule.category === "*") && input.wordCount >= rule.minWords && input.wordCount <= rule.maxWords && Date.parse(rule.effectiveFrom) <= at && (rule.effectiveTo === null || Date.parse(rule.effectiveTo) > at)).sort((a, b) => Number(b.category === input.category) - Number(a.category === input.category) || Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
}
