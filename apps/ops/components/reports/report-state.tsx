import Link from "next/link";
import type { ProviderState } from "@omnilede/contracts";

export function ReportState({ state, fetchedAt }: { state: ProviderState; fetchedAt: string | null }) {
  if (state === "connected") return null;
  const message = state === "stale" || state === "delayed"
    ? `Google could not refresh this report. Last verified values from ${fetchedAt ? new Date(fetchedAt).toLocaleString() : "the previous refresh"} are shown as ${state}.`
    : state === "disconnected" ? "Connect Google to load verified data." : "Google data is unavailable. The connection may require reconnection.";
  return <div className="studio-empty-state report-notice" role="status"><p>{message}</p><span>No missing value is replaced with zero. <Link href="/settings/connections">Review connections</Link>.</span></div>;
}
