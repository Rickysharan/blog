import { uuidV4Schema } from "@omnilede/contracts";

import { requireReviewer } from "../../../../../lib/auth/authorization";
import { decisionInputSchema, applyReviewDecision } from "../../../../../lib/admin/decisions";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../../lib/auth/http";
import { parseInput } from "../../../../../lib/auth/input";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let identity;
  try { identity = await requireReviewer(); } catch { return jsonAuthResponse({ error: "Reviewer access required" }, 403); }
  const { id } = await context.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonAuthResponse({ error: "Submission not found" }, 404);
  let input: ReturnType<typeof decisionInputSchema.parse>;
  try { input = await parseInput(request, decisionInputSchema, "Invalid review decision"); }
  catch (error) { return inputErrorResponse(error); }
  try { return jsonAuthResponse({ ok: true, ...(await applyReviewDecision(identity, id, input)) }); }
  catch (error) { const message = error instanceof Error ? error.message : ""; if (message.includes("conflict")) return jsonAuthResponse({ error: "Submission changed; refresh before deciding" }, 409); return unavailableResponse(); }
}
