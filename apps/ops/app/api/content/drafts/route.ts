import { requireStudioOperator } from "../../../../lib/auth/operator";
import { createStudioContentRepository, contentError, privateJson } from "../../../../lib/content/repository";
import { listPublicationHistory } from "../../../../lib/publication/history";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireStudioOperator();
    const [drafts, history] = await Promise.all([createStudioContentRepository().list(), listPublicationHistory()]);
    return privateJson({ drafts, history });
  } catch (error) { return contentError(error); }
}
