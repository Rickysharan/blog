import type { ReportRange } from "@omnilede/contracts";

export const REPORT_PRESETS = ["7d", "28d", "3m", "12m"] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export function parseReportPreset(value: string | null | undefined): ReportPreset {
  return REPORT_PRESETS.includes(value as ReportPreset) ? value as ReportPreset : "28d";
}

export function resolveReportRange(preset: ReportPreset, now = new Date()): ReportRange {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  if (preset === "3m") start.setUTCMonth(start.getUTCMonth() - 3);
  else if (preset === "12m") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCDate(start.getUTCDate() - (preset === "7d" ? 6 : 27));
  const result = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 367) throw new Error("Report date range is out of bounds");
  return result;
}
