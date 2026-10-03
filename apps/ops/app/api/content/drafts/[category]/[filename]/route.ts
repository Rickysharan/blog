import { z } from "zod";
import { validateDraftMdx, validateDraftRef } from "@omnilede/editorial";
import { requireStudioOperator } from "../../../../../../lib/auth/operator";
import { contentError, createStudioContentRepository, privateJson } from "../../../../../../lib/content/repository";
import { ContentRequestError, readBoundedJson, requireSameOrigin } from "../../../../../../lib/http/same-origin";
import { appendPublicationEvent } from "../../../../../../lib/publication/history";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ category: string; filename: string }> };
const mutationSchema = z.object({
  action: z.enum(["save", "publish", "discard"]),
  expectedVersion: z.string().regex(/^[a-f0-9]{40}$/),
  mdx: z.string().optional(),
  confirmedTitle: z.string().max(180).optional(),
  confirmedCategory: z.string().max(40).optional()
}).strict();
export async function GET(_request: Request, context: Context) {
  try {
    await requireStudioOperator();
    const ref = validateDraftRef(await context.params);
    return privateJson({ draft: await createStudioContentRepository().read(ref) });
  } catch (error) { return contentError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireStudioOperator();
    requireSameOrigin(request);
    const ref = validateDraftRef(await context.params);
    const parsed = mutationSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new ContentRequestError(400, "invalid_input", "Action and loaded version are required.");
    const { action, expectedVersion, mdx, confirmedTitle, confirmedCategory } = parsed.data;
    if (mdx !== undefined && new TextEncoder().encode(mdx).byteLength > 200 * 1024) throw new ContentRequestError(413, "invalid_input", "MDX exceeds the 200 KiB limit.");
    if (action !== "discard") {
      if (mdx === undefined) throw new ContentRequestError(400, "invalid_input", "MDX is required.");
      const article = validateDraftMdx(ref, mdx);
      if (action === "publish" && (confirmedTitle !== article.title || confirmedCategory !== article.category)) {
        throw new ContentRequestError(400, "invalid_input", "Confirm the exact title and category of the reviewed article.");
      }
    }
    const repository = createStudioContentRepository();
    const draft = action === "save" ? await repository.save(ref, mdx!, expectedVersion) : undefined;
    const published = action === "publish" ? await repository.publish(ref, mdx!, expectedVersion) : undefined;
    const discarded = action === "discard" ? await repository.discard(ref, expectedVersion) : undefined;
    const result = published ?? discarded;
    const event = {
      actor_id: actor.userId, action, category: ref.category, content_ref: `${ref.category}/${ref.filename}`,
      prior_version: expectedVersion, resulting_version: draft?.version ?? discarded?.version ?? published?.commitUrl?.split("/").at(-1) ?? null,
      commit_url: result?.commitUrl ?? null, created_at: new Date().toISOString()
    };
    let historyWarning: string | undefined;
    try { await appendPublicationEvent(event); }
    catch { historyWarning = "The action succeeded, but publication history could not be recorded. Do not repeat the action; use the action receipt to reconcile history."; }
    return privateJson({
      draft, result,
      event: historyWarning ? undefined : event,
      reconciliation: historyWarning ? event : undefined,
      historyWarning
    });
  } catch (error) { return contentError(error); }
}
