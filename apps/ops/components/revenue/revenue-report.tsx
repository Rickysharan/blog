import type { ProviderState } from "@omnilede/contracts";

import type { AdsenseReport } from "../../lib/providers/adsense";

function metric(value: number | null, options?: Intl.NumberFormatOptions): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-GB", options).format(value);
}

function statusLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function RevenueMetric({ label, value, source, fetchedAt, state }: { label: string; value: string; source: string; fetchedAt: string | null; state: ProviderState }) {
  return <article className="source-card"><p>{label}</p><strong className="metric-value">{value}</strong><small>{source} · {fetchedAt ? `Fetched ${new Date(fetchedAt).toLocaleString()}` : "No verified report"}</small>{state !== "connected" && <span className="report-state">{state}</span>}</article>;
}

export function RevenueReport({ data, source, fetchedAt, state }: { data: AdsenseReport; source: string; fetchedAt: string | null; state: ProviderState }) {
  const currencyOptions: Intl.NumberFormatOptions | undefined = data.metrics.currency ? { style: "currency", currency: data.metrics.currency } : undefined;
  return <>
    <div className="source-grid">
      <RevenueMetric label="Estimated earnings" value={metric(data.metrics.estimatedEarnings, currencyOptions)} source={source} fetchedAt={fetchedAt} state={state}/>
      <RevenueMetric label="Impressions" value={metric(data.metrics.impressions)} source={source} fetchedAt={fetchedAt} state={state}/>
      <RevenueMetric label="Clicks" value={metric(data.metrics.clicks)} source={source} fetchedAt={fetchedAt} state={state}/>
      <RevenueMetric label="Page RPM" value={metric(data.metrics.pageRpm, currencyOptions)} source={source} fetchedAt={fetchedAt} state={state}/>
    </div>
    <section className="report-panel" aria-labelledby="provider-facts-heading">
      <h2 id="provider-facts-heading">Provider facts</h2>
      <dl className="source-grid">
        <div className="source-card"><dt>Account</dt><dd>{data.account.displayName} · {statusLabel(data.account.status)}</dd></div>
        <div className="source-card"><dt>Site</dt><dd>{data.site ? <>{data.site.domain} · <span>{statusLabel(data.site.status)}</span></> : "Site data unavailable for this account"}</dd></div>
        <div className="source-card"><dt>Ownership</dt><dd>{data.site?.ownershipVerified ? "Verified by Ready status" : "Unavailable"}</dd></div>
        <div className="source-card"><dt>ads.txt</dt><dd>{statusLabel(data.adsTxt.status)} · <a href={data.adsTxt.url} rel="noreferrer" target="_blank">View live file</a></dd></div>
      </dl>
      {data.account.pendingTasks.length > 0 && <><h3>Account tasks</h3><ul>{data.account.pendingTasks.map((task) => <li key={task}>{task}</li>)}</ul></>}
      {data.policyMessages.length > 0 && <><h3>Policy issues</h3><ul>{data.policyMessages.map((message, index) => <li key={`${message.site}-${index}`}>{message.site}: {message.topics.join(", ")} ({statusLabel(message.action)})</li>)}</ul></>}
      {data.configurationMessages === null
        ? <p>Provider alerts are unavailable for this account.</p>
        : data.configurationMessages.length > 0 && <><h3>Provider messages</h3><ul>{data.configurationMessages.map((message, index) => <li key={`${message.type}-${index}`}>{message.severity}: {message.message}</li>)}</ul></>}
    </section>
  </>;
}
