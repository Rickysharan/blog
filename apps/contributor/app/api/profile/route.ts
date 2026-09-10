import { profileUpdateSchema } from "@omnilede/contracts";

import { requireIdentity } from "../../../lib/auth/authorization";
import { inputErrorResponse, jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../lib/auth/http";
import { parseInput } from "../../../lib/auth/input";
import { getProfile, ProfileConflictError, updateProfile } from "../../../lib/profiles/repository";

export const dynamic = "force-dynamic";

async function identityOrResponse() {
  try {
    return await requireIdentity();
  } catch {
    return jsonAuthResponse({ error: "Sign in required" }, 401);
  }
}

export async function GET() {
  const identity = await identityOrResponse();
  if (identity instanceof Response) return identity;
  try {
    const profile = await getProfile(identity.userId);
    if (!profile) return jsonAuthResponse({ error: "Profile not found" }, 404);
    return jsonAuthResponse({ profile });
  } catch {
    return unavailableResponse();
  }
}

export async function PATCH(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  const identity = await identityOrResponse();
  if (identity instanceof Response) return identity;

  let input: ReturnType<typeof profileUpdateSchema.parse>;
  try {
    input = await parseInput(request, profileUpdateSchema, "Invalid profile input");
  } catch (error) {
    return inputErrorResponse(error);
  }

  try {
    const profile = await updateProfile(identity.userId, input);
    return jsonAuthResponse({ profile });
  } catch (error) {
    if (error instanceof ProfileConflictError) return jsonAuthResponse({ error: error.message }, 409);
    return unavailableResponse();
  }
}
