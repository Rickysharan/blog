import type { ProviderState } from "@omnilede/contracts";

export function MetricCard({ label, value, source, fetchedAt, state }: { label: string; value: string | number | null; source: string; fetchedAt: string | null; state: ProviderState }) {
  return <article className="source-card report-card">
    <p>{label}</p><strong>{value ?? "Unavailable"}</strong>
    <small>{source} · {fetchedAt ? `Fetched ${new Date(fetchedAt).toLocaleString()}` : state === "disconnected" ? "Not connected" : "No verified report"}</small>
    {state !== "connected" && <span className="report-state">{state}</span>}
  </article>;
}
