import type { ProviderState } from "@omnilede/contracts";

export function ReportProvenance({ source, fetchedAt, state }: { source: string; fetchedAt: string | null; state: ProviderState }) {
  return <p className="report-provenance">{source} · {state} · {fetchedAt ? `Fetched ${new Date(fetchedAt).toLocaleString()}` : "Never fetched"}</p>;
}
