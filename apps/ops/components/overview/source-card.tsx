import type { ProviderState } from "@omnilede/contracts";

export function SourceCard({ label, value, state, source, refreshedAt }: {
  label: string;
  value: string | number | null;
  state: ProviderState | "available";
  source: string;
  refreshedAt: string | null;
}) {
  const status = state === "available" || state === "connected" ? (refreshedAt ? `Updated ${new Date(refreshedAt).toLocaleString()}` : "Current repository data") : state === "disconnected" ? "Not connected" : state;
  const displayValue = value ?? (state === "connected" ? "Awaiting data" : "Unavailable");
  return (
    <article className="source-card">
      <p>{label}</p>
      <strong>{displayValue}</strong>
      <small>{source} · {status}</small>
    </article>
  );
}
