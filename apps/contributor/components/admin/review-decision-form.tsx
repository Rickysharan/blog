"use client";

import { useState } from "react";

export function ReviewDecisionForm({ submissionId, expectedVersion }: { submissionId: string; expectedVersion: number }) {
  const [decision, setDecision] = useState("approve");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (decision !== "approve" && !window.confirm("This decision changes the contributor’s workflow. Continue?")) return;
    setPending(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/admin/review/${submissionId}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion, decision, reason, evidenceAcknowledged: acknowledged }) });
      const body = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) setError(body.error ?? "Unable to save decision"); else setStatus(`Decision recorded: ${(body.status ?? decision).replace("_", " ")}.`);
    } catch { setError("The network is unavailable. Please try again."); }
    finally { setPending(false); }
  }

  return (
    <form className="settings-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p className="eyebrow">Human decision</p>
      <h2>Accountable review</h2>
      <label>Decision<select value={decision} onChange={(event) => setDecision(event.target.value)}><option value="approve">Approve</option><option value="request_changes">Request changes</option><option value="reject">Reject</option></select></label>
      <label>Reason<textarea required minLength={10} maxLength={2_000} rows={5} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="guidelines-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} required /><span>I reviewed the available evidence and understand automated checks are not a legal originality guarantee.</span></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}{status ? <p className="form-success" role="status">{status}</p> : null}
      <button className="button button-primary" type="submit" disabled={pending || !acknowledged}>{pending ? "Recording…" : "Record decision"}</button>
    </form>
  );
}
