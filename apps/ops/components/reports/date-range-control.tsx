import Link from "next/link";
import { REPORT_PRESETS, type ReportPreset } from "../../lib/providers/report-range";

const labels: Record<ReportPreset, string> = { "7d": "7 days", "28d": "28 days", "3m": "3 months", "12m": "12 months" };
export function DateRangeControl({ selected }: { selected: ReportPreset }) {
  return <nav className="report-ranges" aria-label="Report date range">{REPORT_PRESETS.map((range) =>
    <Link key={range} aria-current={selected === range ? "page" : undefined} href={`?range=${range}`}>{labels[range]}</Link>)}</nav>;
}
