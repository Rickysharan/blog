import { CATEGORIES } from "@omnilede/editorial";

import { requireStudioOperator } from "../../../../lib/auth/operator";
import { contentError, privateJson } from "../../../../lib/content/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireStudioOperator();
    return privateJson({
      protocolVersion: 1,
      nativeCapability: "injected-by-omnilede-app",
      categories: CATEGORIES.map(({ slug, label }) => ({ slug, label })),
    });
  } catch (error) {
    return contentError(error);
  }
}
