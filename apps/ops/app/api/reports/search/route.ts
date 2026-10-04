import { z } from "zod";
import { requireStudioOperator } from "../../../../lib/auth/operator";
import { contentError, privateJson } from "../../../../lib/content/repository";
import { deriveSearchOpportunities, opportunityToTask } from "../../../../lib/growth/opportunities";
import { ContentRequestError, readBoundedJson, requireSameOrigin } from "../../../../lib/http/same-origin";
import { parseReportPreset } from "../../../../lib/providers/report-range";
import { fetchSearchReport } from "../../../../lib/providers/search-console";
import { refreshTodayTasks } from "../../../../lib/tasks/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireStudioOperator();
    return privateJson(await fetchSearchReport(parseReportPreset(new URL(request.url).searchParams.get("range"))));
  } catch (error) { return contentError(error); }
}

const copySchema = z.object({ action: z.literal("copy-opportunity"), range: z.enum(["7d", "28d", "3m", "12m"]), evidenceKey: z.string().min(1).max(120) }).strict();
export async function POST(request: Request) {
  try {
    await requireStudioOperator(); requireSameOrigin(request);
    const parsed = copySchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) throw new ContentRequestError(400, "invalid_input", "A valid search opportunity is required.");
    const report = await fetchSearchReport(parsed.data.range);
    if (report.state !== "connected") throw new ContentRequestError(409, "conflict", "Refresh Search successfully before copying current evidence into Today.");
    const opportunity = report.data && deriveSearchOpportunities(report.data).find(({ evidenceKey }) => evidenceKey === parsed.data.evidenceKey);
    if (!opportunity) throw new ContentRequestError(409, "conflict", "That search evidence is no longer available. Refresh Search and try again.");
    const tasks = await refreshTodayTasks([opportunityToTask(opportunity)]);
    return privateJson({ task: tasks.find(({ evidenceKey }) => evidenceKey === opportunity.evidenceKey) ?? null });
  } catch (error) { return contentError(error); }
}
