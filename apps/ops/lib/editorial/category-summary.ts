import {
  CATEGORIES,
  type CategorySlug,
  type EditorialInventory,
} from "@omnilede/editorial";
import type { ProviderState, ReportEnvelope, StudioTask } from "@omnilede/contracts";

export type CategoryMetric = {
  value: number | null;
  state: ProviderState;
  source: string;
  fetchedAt: string | null;
};

export type CategorySummary = {
  category: CategorySlug;
  label: string;
  publishedCount: number;
  draftCount: number;
  latestPublication: string | null;
  coverageAgeDays: number | null;
  taskState: StudioTask["state"] | null;
  views: CategoryMetric;
  clicks: CategoryMetric;
  warnings: string[];
};

type CategoryMetricData = Partial<Record<CategorySlug, number>>;

export type CategorySummaryReports = {
  now?: Date;
  tasks?: StudioTask[];
  views?: ReportEnvelope<CategoryMetricData>;
  clicks?: ReportEnvelope<CategoryMetricData>;
  warnings?: Partial<Record<CategorySlug, string[]>>;
};

const unavailableMetric = (source: string): CategoryMetric => ({
  value: null,
  state: "unavailable",
  source,
  fetchedAt: null,
});

function metricFor(
  category: CategorySlug,
  report: ReportEnvelope<CategoryMetricData> | undefined,
  defaultSource: string,
): CategoryMetric {
  if (!report) return unavailableMetric(defaultSource);
  const value = report.data?.[category];
  return {
    value: typeof value === "number" && Number.isFinite(value) ? value : null,
    state: report.state,
    source: report.source,
    fetchedAt: report.fetchedAt,
  };
}

export function buildCategorySummaries(
  inventory: EditorialInventory,
  reports: CategorySummaryReports = {},
): CategorySummary[] {
  const now = reports.now ?? new Date();
  return CATEGORIES.map(({ slug: category, label }) => {
    const published = inventory.items.filter((item) => item.category === category && item.kind === "published");
    const draftCount = inventory.items.filter((item) => item.category === category && item.kind === "draft").length;
    const latestPublication = published.map(({ date }) => date).sort().at(-1) ?? null;
    const coverageAgeDays = latestPublication === null
      ? null
      : Math.max(0, Math.floor((now.getTime() - new Date(latestPublication).getTime()) / 86_400_000));
    const categoryTask = reports.tasks?.find((task) => task.category === category);
    return {
      category,
      label,
      publishedCount: published.length,
      draftCount,
      latestPublication,
      coverageAgeDays,
      taskState: categoryTask?.state ?? null,
      views: metricFor(category, reports.views, "Google Analytics"),
      clicks: metricFor(category, reports.clicks, "Google Search Console"),
      warnings: [...(reports.warnings?.[category] ?? [])],
    };
  });
}
