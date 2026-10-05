"use client";

import { useState } from "react";

import type { SafeGoogleConnection } from "../../lib/google/connections";

const names: Record<SafeGoogleConnection["provider"], string> = {
  "google-analytics": "Google Analytics",
  "google-search-console": "Google Search Console",
  "google-adsense": "Google AdSense"
};

const scopeNames: Record<string, string> = {
  openid: "Verify Google identity",
  email: "Read verified email",
  "https://www.googleapis.com/auth/analytics.readonly": "Read Analytics reports",
  "https://www.googleapis.com/auth/webmasters.readonly": "Read Search Console reports",
  "https://www.googleapis.com/auth/adsense.readonly": "Read AdSense reports"
};

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not checked yet";
}

export function GoogleConnection({ connections }: { connections: SafeGoogleConnection[] }) {
  const [items, setItems] = useState(connections);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = items.some(({ state }) => state !== "disconnected");

  async function refresh() {
    setBusy(true);
    setMessage("Checking Google for report properties…");
    try {
      const response = await fetch("/api/connections/google/refresh", { method: "POST", headers: { accept: "application/json" } });
      const result = await response.json() as {
        results?: Array<{ status: "selected" | "empty" | "unavailable" }>;
        connections?: SafeGoogleConnection[];
        message?: string;
      };
      if (!response.ok || !result.results || !result.connections) throw new Error("refresh failed");
      setItems(result.connections);
      const selected = result.results.filter(({ status }) => status === "selected").length;
      const empty = result.results.filter(({ status }) => status === "empty").length;
      const unavailable = result.results.length - selected - empty;
      setMessage(`${selected} report ${selected === 1 ? "property" : "properties"} ready. ${empty} not set up yet.${unavailable ? ` ${unavailable} could not be checked.` : ""}`);
    } catch {
      setMessage("Google reports could not be checked. Your editorial work is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/connections/google/revoke", { method: "POST", headers: { accept: "application/json" } });
      const result = await response.json() as { state?: string; message?: string };
      setMessage(result.message ?? (result.state === "disconnected" ? "Google access was revoked." : "Reconnect is required."));
      if (response.ok) window.location.reload();
    } catch {
      setMessage("The connection could not be changed. Your editorial work is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="connection-panel" aria-labelledby="google-connection-title">
      <div className="connection-heading">
        <div>
          <p className="eyebrow">Free read-only connection</p>
          <h2 id="google-connection-title">Google reports</h2>
        </div>
        <div className="connection-actions">
          {connected ? <button className="studio-button" disabled={busy} onClick={refresh} type="button">{busy ? "Checking…" : "Refresh reports"}</button> : null}
          <form action="/api/connections/google/start" method="post"><button className="studio-button studio-button-secondary" disabled={busy} type="submit">{connected ? "Reconnect" : "Connect Google"}</button></form>
        </div>
      </div>
      <p className="connection-note">Studio requests read-only reporting access. It cannot change Analytics, Search Console, AdSense, articles, or ads.</p>
      <div className="connection-grid">
        {items.map((connection) => (
          <article className="connection-card" key={connection.provider}>
            <div className="connection-card-title"><h3>{names[connection.provider]}</h3><span data-state={connection.state}>{connection.reconnectRequired ? "Reconnect required" : connection.state}</span></div>
            <dl>
              <div><dt>Account</dt><dd>{connection.accountLabel ?? "Not connected"}</dd></div>
              <div><dt>Property or site</dt><dd>{connection.propertyLabel ?? "Not selected"}</dd></div>
              <div><dt>Last checked</dt><dd>{displayDate(connection.lastCheckedAt)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <details className="connection-scopes">
        <summary>Permissions requested</summary>
        <ul>{[...new Set(items.flatMap(({ scopes }) => scopes))].map((scope) => <li key={scope}>{scopeNames[scope] ?? "Read a Google report"}</li>)}</ul>
      </details>
      {connected ? <button className="studio-button studio-button-danger" disabled={busy} onClick={revoke} type="button">{busy ? "Revoking…" : "Revoke Google access"}</button> : null}
      {message ? <p aria-live="polite" className="connection-message">{message}</p> : null}
    </section>
  );
}
