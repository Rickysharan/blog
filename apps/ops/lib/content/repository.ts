import "server-only";
import { DraftRepositoryError } from "@omnilede/editorial";
import { AuthorizationError } from "../auth/authorization";
import { ContentRequestError } from "../http/same-origin";
export { createStudioContentRepository } from "../editorial/repository";

export function privateJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
export function contentError(error: unknown) {
  if (error instanceof AuthorizationError) return privateJson({ code: "forbidden", message: "Studio operator access required." }, 403);
  if (error instanceof ContentRequestError) return privateJson({ code: error.code, message: error.message }, error.status);
  if (error instanceof DraftRepositoryError) {
    const statuses = { invalid_input: 400, not_found: 404, conflict: 409, storage_unavailable: 503 };
    const messages = {
      invalid_input: 'Draft validation failed. Check frontmatter, category, slug, the "Why it matters" section and final source link.',
      not_found: "Draft not found.",
      conflict: "This draft changed after you loaded it. Your edits are still here. Open another tab to compare and reconcile before retrying.",
      storage_unavailable: "Content storage is temporarily unavailable. Your edits are still here."
    };
    return privateJson({ code: error.code, message: messages[error.code] }, statuses[error.code]);
  }
  return privateJson({ code: "storage_unavailable", message: "Content service is temporarily unavailable. Your edits are still here." }, 503);
}
