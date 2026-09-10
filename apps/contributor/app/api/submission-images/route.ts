import { uuidV4Schema } from "@omnilede/contracts";
import { randomUUID } from "node:crypto";

import { requireIdentity } from "../../../lib/auth/authorization";
import { jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../lib/auth/http";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import { validateImage, ImageValidationError } from "../../../lib/submissions/image";
import { consumeAuthRateLimit } from "../../../lib/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let identity;
  try {
    identity = await requireIdentity();
  } catch {
    return jsonAuthResponse({ error: "Sign in required" }, 401);
  }
  try {
    const limit = await consumeAuthRateLimit(createServiceSupabaseClient(), "submission.image", identity.email, 20, 86400);
    if (limit.unavailable) return unavailableResponse();
    if (!limit.allowed) return jsonAuthResponse({ error: "Upload limit reached for today" }, 429);
  } catch {
    return unavailableResponse();
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 8 * 1024 * 1024 + 64 * 1024) return jsonAuthResponse({ error: "Image is too large" }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonAuthResponse({ error: "Invalid image upload" }, 400);
  }
  const submissionId = form.get("submissionId");
  const file = form.get("file");
  if (typeof submissionId !== "string" || !uuidV4Schema.safeParse(submissionId).success || !(file instanceof File)) {
    return jsonAuthResponse({ error: "Invalid image upload" }, 400);
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const image = validateImage(bytes, file.type, file.name);
    const path = `${identity.userId}/${submissionId}/${randomUUID()}.${image.extension}`;
    const { error } = await createServiceSupabaseClient().storage.from("submission-images").upload(path, bytes, {
      contentType: image.mimeType,
      upsert: false
    });
    if (error) return unavailableResponse();
    return jsonAuthResponse({ path, mimeType: image.mimeType, width: image.width, height: image.height }, 201);
  } catch (error) {
    if (error instanceof ImageValidationError) return jsonAuthResponse({ error: "Image failed validation" }, 400);
    return unavailableResponse();
  }
}
