import { DateRangeControl } from "../../../components/reports/date-range-control";
import { DataTable } from "../../../components/reports/data-table";
import { MetricCard } from "../../../components/reports/metric-card";
import { ReportState } from "../../../components/reports/report-state";
import { TrendChart } from "../../../components/reports/trend-chart";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { fetchGa4Report } from "../../../lib/providers/ga4";
import { parseReportPreset, resolveReportRange } from "../../../lib/providers/report-range";

export const dynamic = "force-dynamic";
export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireStudioOperator(); const preset = parseReportPreset((await searchParams).range); const report = await fetchGa4Report(preset).catch(() => ({ source: "Google Analytics Data API", range: resolveReportRange(preset), fetchedAt: null, state: "unavailable" as const, data: null })); const data = report.data;
  return <div className="studio-page"><p className="eyebrow">Google Analytics</p><h1>Growth</h1><p className="studio-page-intro">Real GA4 measurements for the selected period. Consent choices, blockers, and reporting delay can make GA4 lower than actual readership.</p><DateRangeControl selected={preset}/><ReportState state={report.state} fetchedAt={report.fetchedAt}/>
    <div className="source-grid"><MetricCard label="Active users" value={data?.summary.activeUsers ?? null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/><MetricCard label="Sessions" value={data?.summary.sessions ?? null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/><MetricCard label="Views" value={data?.summary.views ?? null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/><MetricCard label="Engagement rate" value={data ? `${(data.summary.engagementRate * 100).toFixed(1)}%` : null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/></div>
    {data && <><TrendChart title="Daily views" points={data.trend.map((row) => ({ label: row.date, value: row.views }))}/><DataTable caption="Traffic channels" columns={["Channel", "Views", "Sessions"]} rows={data.channels.map((row) => [row.name, row.views, row.sessions])}/><DataTable caption="Landing pages" columns={["Page", "Views", "Sessions"]} rows={data.landingPages.map((row) => [row.name, row.views, row.sessions])}/></>}
  </div>;
}
