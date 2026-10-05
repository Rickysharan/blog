import { z } from "zod";

import { requireStudioOperator } from "../../../lib/auth/operator";
import { contentError, privateJson } from "../../../lib/content/repository";
import { loadStudioEditorialInventory } from "../../../lib/editorial/repository";
import { ContentRequestError, readBoundedJson, requireSameOrigin } from "../../../lib/http/same-origin";
import { deriveTodayTasks } from "../../../lib/tasks/derive";
import { listProviderConnections, listTodayTasks, refreshTodayTasks } from "../../../lib/tasks/repository";
import { auditPublicSite, siteFindingsToSeoWarnings } from "../../../../../lib/seo/audit";

export const dynamic = "force-dynamic";
const refreshSchema = z.object({ action: z.literal("refresh") }).strict();

export async function GET() {
  try {
    await requireStudioOperator();
    return privateJson({ tasks: await listTodayTasks() });
  } catch (error) {
    return contentError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireStudioOperator();
    requireSameOrigin(request);
    const parsed = refreshSchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new ContentRequestError(400, "invalid_input", "Refresh is the only supported task-list action.");
    const [inventory, connections, siteFindings] = await Promise.all([
      loadStudioEditorialInventory(),
      listProviderConnections(),
      auditPublicSite(process.env.NEXT_PUBLIC_BLOG_URL ?? "https://omnilede-news.netlify.app"),
    ]);
    const tasks = deriveTodayTasks({
      inventory,
      providers: connections.map(({ provider, state }) => ({ provider, state })),
      seoWarnings: siteFindingsToSeoWarnings(siteFindings),
      adsense: connections.find(({ provider }) => provider === "google-adsense")?.state === "connected"
        ? null
        : { state: "setup-required", detail: "AdSense is not connected. Complete setup only when the site is ready; ads remain disabled." },
    });
    return privateJson({ tasks: await refreshTodayTasks(tasks) });
  } catch (error) {
    return contentError(error);
  }
}
