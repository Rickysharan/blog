export type ActiveClaim = { topicId: string; userId: string; expiresAt: string; status: "active" | "expired" | "released" };

export function claimIsAvailable(topicId: string, userId: string, claims: readonly ActiveClaim[], maxActiveClaims: number, now = new Date()): boolean {
  const active = claims.filter((claim) => claim.status === "active" && Date.parse(claim.expiresAt) > now.getTime());
  return !active.some((claim) => claim.topicId === topicId) && active.filter((claim) => claim.userId === userId).length < maxActiveClaims;
}

export function claimExpiresAt(now = new Date(), days = 7): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
