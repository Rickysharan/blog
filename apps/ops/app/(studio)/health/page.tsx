import { HealthList } from "../../../components/health/health-list";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { collectSiteHealth } from "../../../lib/health/site-health";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  await requireStudioOperator();
  let findings: Awaited<ReturnType<typeof collectSiteHealth>> | undefined;
  try {
    findings = await collectSiteHealth();
  } catch {
    // Render a truthful unavailable state below.
  }
  if (!findings) return <div className="studio-page"><h1>Site health</h1><div className="studio-empty-state" role="alert"><p>Health evidence is temporarily unavailable.</p><span>No failing check has been reported as healthy. Reload after checking provider access.</span></div></div>;
  return <div className="studio-page"><p className="eyebrow">Evidence and recovery</p><h1>Site health</h1><p className="studio-page-intro">Each check shows its source evidence, affected URL, check time, severity, and the next recovery action.</p><HealthList findings={findings} /></div>;
}
