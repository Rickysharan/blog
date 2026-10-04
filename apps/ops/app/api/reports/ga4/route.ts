import { requireStudioOperator } from "../../../../lib/auth/operator";
import { contentError, privateJson } from "../../../../lib/content/repository";
import { fetchGa4Report } from "../../../../lib/providers/ga4";
import { parseReportPreset } from "../../../../lib/providers/report-range";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireStudioOperator();
    return privateJson(await fetchGa4Report(parseReportPreset(new URL(request.url).searchParams.get("range"))));
  } catch (error) { return contentError(error); }
}
