import { DateRangeControl } from "../../../components/reports/date-range-control";
import { DataTable } from "../../../components/reports/data-table";
import { MetricCard } from "../../../components/reports/metric-card";
import { OpportunityList } from "../../../components/reports/opportunity-list";
import { ReportState } from "../../../components/reports/report-state";
import { TrendChart } from "../../../components/reports/trend-chart";
import { deriveSearchOpportunities } from "../../../lib/growth/opportunities";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { parseReportPreset, resolveReportRange } from "../../../lib/providers/report-range";
import { fetchSearchReport } from "../../../lib/providers/search-console";

export const dynamic = "force-dynamic";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireStudioOperator(); const preset = parseReportPreset((await searchParams).range); const report = await fetchSearchReport(preset).catch(() => ({ source: "Google Search Console API", range: resolveReportRange(preset), fetchedAt: null, state: "unavailable" as const, data: null })); const data = report.data; const opportunities = data ? deriveSearchOpportunities(data) : [];
  return <div className="studio-page"><p className="eyebrow">Google Search Console</p><h1>Search</h1><p className="studio-page-intro">Verified search performance, indexing evidence, and suggested follow-up work. Suggestions never change an article.</p><DateRangeControl selected={preset}/><ReportState state={report.state} fetchedAt={report.fetchedAt}/>
    <div className="source-grid"><MetricCard label="Clicks" value={data?.summary?.clicks ?? null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/><MetricCard label="Impressions" value={data?.summary?.impressions ?? null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/><MetricCard label="CTR" value={data?.summary ? `${(data.summary.ctr * 100).toFixed(1)}%` : null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/><MetricCard label="Average position" value={data?.summary?.position.toFixed(1) ?? null} source={report.source} fetchedAt={report.fetchedAt} state={report.state}/></div>
    {data && <><TrendChart title="Daily search clicks" points={data.trend.map((row) => ({ label: row.key, value: row.clicks }))}/><DataTable caption="Search queries" columns={["Query", "Clicks", "Impressions", "CTR", "Position"]} rows={data.queries.map((row) => [row.key, row.clicks, row.impressions, `${(row.ctr * 100).toFixed(1)}%`, row.position.toFixed(1)])}/><OpportunityList opportunities={opportunities} range={preset}/></>}
  </div>;
}
