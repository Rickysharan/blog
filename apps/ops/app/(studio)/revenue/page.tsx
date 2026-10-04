import { DateRangeControl } from "../../../components/reports/date-range-control";
import { ReportState } from "../../../components/reports/report-state";
import { ReadinessChecklist } from "../../../components/revenue/readiness-checklist";
import { RevenueReport } from "../../../components/revenue/revenue-report";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { fetchAdsenseReport } from "../../../lib/providers/adsense";
import { parseReportPreset, resolveReportRange } from "../../../lib/providers/report-range";
import { evaluateAdsenseReadiness } from "../../../lib/revenue/readiness";

export const dynamic = "force-dynamic";

function exactIdentifiersMatch(): boolean {
  const publisher = process.env.ADSENSE_PUBLISHER_ID;
  const client = process.env.ADSENSE_CLIENT_ID;
  return Boolean(publisher && client && /^pub-\d{16}$/.test(publisher) && client === `ca-${publisher}`);
}

function slotsValid(): boolean {
  const names = ["ADSENSE_SLOT_HEADER", "ADSENSE_SLOT_IN_FEED", "ADSENSE_SLOT_ARTICLE", "ADSENSE_SLOT_SIDEBAR", "ADSENSE_SLOT_FOOTER"];
  return names.every((name) => /^\d{10}$/.test(process.env[name] ?? ""));
}

export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireStudioOperator();
  const preset = parseReportPreset((await searchParams).range);
  const report = await fetchAdsenseReport(preset).catch(() => ({ source: "Google AdSense Management API", range: resolveReportRange(preset), fetchedAt: null, state: "unavailable" as const, data: null }));
  const data = report.data;
  const findings = evaluateAdsenseReadiness({
    providerState: report.state === "delayed" ? "stale" : report.state,
    accountStatus: data?.account.status ?? null,
    siteStatus: data?.site.status ?? null,
    configuredSiteStatus: process.env.ADSENSE_SITE_STATUS ?? null,
    pendingTasks: data?.account.pendingTasks ?? null,
    ownershipVerified: data?.site.ownershipVerified ?? null,
    adsTxtStatus: data?.adsTxt.status ?? "unavailable",
    consentConfigured: true,
    commercialEnabled: process.env.COMMERCIAL_FEATURES_ENABLED === "true",
    adsenseEnabled: process.env.ADSENSE_ENABLED === "true",
    publisherIdsMatch: exactIdentifiersMatch(),
    slotsValid: slotsValid(),
    policyIssueCount: data?.policyMessages.length ?? 0,
    configurationIssueCount: data?.configurationMessages.length ?? 0
  });

  return <div className="studio-page">
    <p className="eyebrow">Google AdSense</p>
    <h1>Revenue</h1>
    <p className="studio-page-intro">Provider-reported review state and genuine performance values. Missing figures stay unavailable, and Google alone decides whether the site is Ready.</p>
    <DateRangeControl selected={preset}/>
    <ReportState state={report.state} fetchedAt={report.fetchedAt}/>
    {data && <RevenueReport data={data} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/>}
    <ReadinessChecklist findings={findings}/>
    <section className="report-panel" aria-labelledby="application-steps-heading">
      <h2 id="application-steps-heading">Application steps</h2>
      <ol>
        <li>Connect the read-only Google provider and verify the exact account and site facts above.</li>
        <li>Publish the validated seller record at the root ads.txt URL.</li>
        <li>Resolve every ownership, policy, configuration, placement, and consent blocker.</li>
        <li>Submit the application yourself in the operator-owned AdSense account when you are ready.</li>
        <li>Keep advertising disabled until Google reports the site status exactly as Ready.</li>
      </ol>
      <p className="native-note">Studio reads status and reports. It does not submit an application, request review, accept terms, or enable billing.</p>
    </section>
  </div>;
}
