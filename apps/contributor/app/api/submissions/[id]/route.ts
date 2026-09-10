import { submissionSaveSchema, uuidV4Schema } from "@omnilede/contracts";

import { requireIdentity } from "../../../../lib/auth/authorization";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../../lib/auth/http";
import { parseInput } from "../../../../lib/auth/input";
import { getSubmission, saveSubmission, SubmissionConflictError } from "../../../../lib/submissions/repository";

export const dynamic = "force-dynamic";

async function currentIdentity() {
  try {
    return await requireIdentity();
  } catch {
    return jsonAuthResponse({ error: "Sign in required" }, 401);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await currentIdentity();
  if (identity instanceof Response) return identity;
  const { id } = await context.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonAuthResponse({ error: "Submission not found" }, 404);
  try {
    const submission = await getSubmission(identity.userId, id);
    return submission ? jsonAuthResponse({ submission }) : jsonAuthResponse({ error: "Submission not found" }, 404);
  } catch {
    return unavailableResponse();
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  const identity = await currentIdentity();
  if (identity instanceof Response) return identity;
  const { id } = await context.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonAuthResponse({ error: "Submission not found" }, 404);
  let input: ReturnType<typeof submissionSaveSchema.parse>;
  try {
    input = await parseInput(request, submissionSaveSchema, "Invalid submission input");
  } catch (error) {
    return inputErrorResponse(error);
  }
  const path = input.privateImagePath.split("/");
  if (path[0] !== identity.userId || path[1] !== id) return jsonAuthResponse({ error: "Image path must belong to this submission" }, 400);
  try {
    return jsonAuthResponse({ submission: await saveSubmission(identity.userId, id, input) });
  } catch (error) {
    if (error instanceof SubmissionConflictError) return jsonAuthResponse({ error: error.message }, 409);
    return unavailableResponse();
  }
}
