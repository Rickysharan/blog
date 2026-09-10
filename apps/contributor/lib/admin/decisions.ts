import "server-only";

import { z } from "zod";

import { createServiceSupabaseClient } from "../supabase/server";
import type { VerifiedIdentity } from "../auth/authorization";

export const decisionInputSchema = z.object({
  expectedVersion: z.number().int().positive().safe(),
  decision: z.enum(["approve", "reject", "request_changes"]),
  reason: z.string().trim().min(10).max(2_000),
  evidenceAcknowledged: z.literal(true)
}).strict();

export type DecisionInput = z.infer<typeof decisionInputSchema>;

export async function applyReviewDecision(identity: VerifiedIdentity, submissionId: string, input: DecisionInput): Promise<{ status: string }> {
  const actorType = identity.roles.includes("admin") ? "admin" : "reviewer";
  const { data, error } = await createServiceSupabaseClient().schema("app_private").rpc("apply_review_decision", {
    p_submission_id: submissionId,
    p_submission_version: input.expectedVersion,
    p_actor_type: actorType,
    p_actor_id: identity.userId,
    p_decision: input.decision,
    p_reason: input.reason
  });
  if (error || !data) throw new Error(error?.message ?? "Unable to apply review decision");
  return { status: (data as { status: string }).status };
}
