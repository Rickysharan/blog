import type { ProviderState } from "@omnilede/contracts";

export function SourceCard({ label, value, state, source, refreshedAt }: {
  label: string;
  value: string | number | null;
  state: ProviderState | "available";
  source: string;
  refreshedAt: string | null;
}) {
  const status = state === "available" || state === "connected" ? (refreshedAt ? `Updated ${new Date(refreshedAt).toLocaleString()}` : "Current repository data") : state === "disconnected" ? "Not connected" : state;
  return (
    <article className="source-card">
      <p>{label}</p>
      <strong>{value ?? "Unavailable"}</strong>
      <small>{source} · {status}</small>
    </article>
  );
}
