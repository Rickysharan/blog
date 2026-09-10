"use client";

import { useState } from "react";

export function TopicClaimButton({ topicId }: { topicId: string }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  async function claim() {
    setPending(true); setStatus("");
    try {
      const response = await fetch(`/api/topics/${topicId}/claim`, { method: "POST", credentials: "include" });
      const body = (await response.json()) as { error?: string };
      setStatus(response.ok ? "Topic claimed for 7 days." : body.error ?? "Topic unavailable");
    } catch { setStatus("Network unavailable"); }
    finally { setPending(false); }
  }
  return <><button className="button button-secondary" type="button" onClick={() => void claim()} disabled={pending}>{pending ? "Claiming…" : "Claim topic ↗"}</button>{status ? <span className="field-hint" role="status">{status}</span> : null}</>;
}
