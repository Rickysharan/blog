import { submissionCreateSchema } from "@omnilede/contracts";

import { requireIdentity } from "../../../lib/auth/authorization";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../lib/auth/http";
import { parseInput } from "../../../lib/auth/input";
import { createDraft, listSubmissions } from "../../../lib/submissions/repository";

export const dynamic = "force-dynamic";

async function currentIdentity() {
  try {
    return await requireIdentity();
  } catch {
    return jsonAuthResponse({ error: "Sign in required" }, 401);
  }
}

export async function GET() {
  const identity = await currentIdentity();
  if (identity instanceof Response) return identity;
  try {
    return jsonAuthResponse({ submissions: await listSubmissions(identity.userId) });
  } catch {
    return unavailableResponse();
  }
}

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  const identity = await currentIdentity();
  if (identity instanceof Response) return identity;
  let input: ReturnType<typeof submissionCreateSchema.parse>;
  try {
    input = await parseInput(request, submissionCreateSchema, "Invalid submission input");
  } catch (error) {
    return inputErrorResponse(error);
  }
  const path = input.privateImagePath.split("/");
  if (path[0] !== identity.userId || path[1] !== input.id) {
    return jsonAuthResponse({ error: "Image path must belong to this submission" }, 400);
  }
  try {
    return jsonAuthResponse({ submission: await createDraft(identity.userId, input) }, 201);
  } catch {
    return unavailableResponse();
  }
}
