import { DraftRepositoryError, type DraftRef, type DraftRepository } from "@/lib/drafts/types";

/** Only creation is permitted: never save, discard, or publish a remote article. */
export async function syncDrafts(
  source: Pick<DraftRepository, "list" | "read">,
  target: Pick<DraftRepository, "read" | "create">,
) {
  const result: { created: DraftRef[]; unchanged: DraftRef[]; failed: Array<{ ref: DraftRef; code: string }> } = {
    created: [], unchanged: [], failed: [],
  };
  for (const { ref } of await source.list()) {
    try {
      const draft = await source.read(ref);
      try {
        const existing = await target.read(ref);
        if (existing.mdx !== draft.mdx) throw new DraftRepositoryError("conflict", "Editor has changed the draft");
        result.unchanged.push(ref);
        continue;
      } catch (error) {
        if (!(error instanceof DraftRepositoryError) || error.code !== "not_found") throw error;
      }
      await target.create(ref, draft.mdx);
      result.created.push(ref);
    } catch (error) {
      result.failed.push({ ref, code: error instanceof DraftRepositoryError ? error.code : "storage_unavailable" });
    }
  }
  return result;
}
