import { requireStudioOperator } from "../../../lib/auth/operator";
import { contentError, privateJson } from "../../../lib/content/repository";
import { collectSiteHealth } from "../../../lib/health/site-health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireStudioOperator();
    return privateJson({ findings: await collectSiteHealth() });
  } catch (error) {
    return contentError(error);
  }
}
