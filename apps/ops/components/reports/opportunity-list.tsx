"use client";
import { useState } from "react";
import type { SearchOpportunity } from "../../lib/growth/opportunities";
import type { ReportPreset } from "../../lib/providers/report-range";

export function OpportunityList({ opportunities, range }: { opportunities: SearchOpportunity[]; range: ReportPreset }) {
  const [busy, setBusy] = useState<string>(); const [notice, setNotice] = useState<string>();
  async function copy(evidenceKey: string) {
    setBusy(evidenceKey); setNotice(undefined);
    try {
      const response = await fetch("/api/reports/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "copy-opportunity", range, evidenceKey }) });
      const body = await response.json(); if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "The opportunity could not be copied.");
      setNotice("Added to Today. No article content was changed.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The opportunity could not be copied."); }
    finally { setBusy(undefined); }
  }
  return <section className="report-panel"><h2>Evidence-backed opportunities</h2>{notice && <p role="status">{notice}</p>}{opportunities.length ? <ul>{opportunities.map((item) => <li key={item.evidenceKey}><strong>{item.title}</strong><p>{item.evidence} {item.proposedAction}</p><button className="secondary-action" disabled={Boolean(busy)} onClick={() => copy(item.evidenceKey)}>{busy === item.evidenceKey ? "Adding…" : "Add to Today"}</button></li>)}</ul> : <p>No opportunity crossed the evidence thresholds.</p>}</section>;
}
