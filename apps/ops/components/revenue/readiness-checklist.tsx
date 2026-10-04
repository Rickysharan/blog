import type { ReadinessFinding } from "../../lib/revenue/readiness";

export function ReadinessChecklist({ findings }: { findings: ReadinessFinding[] }) {
  return (
    <section className="report-panel" aria-labelledby="adsense-readiness-heading">
      <h2 id="adsense-readiness-heading">Readiness checklist</h2>
      <p className="report-provenance">Every item must pass before advertising can activate.</p>
      <ul className="health-list">
        {findings.map((finding) => (
          <li className={`health-card ${finding.status === "pass" ? "health-ok" : "health-warning"}`} key={finding.id}>
            <span>{finding.status === "pass" ? "Ready" : "Blocked"}</span>
            <h3>{finding.label}</h3>
            <p>{finding.summary}</p>
            {finding.action && <strong>Next: {finding.action}</strong>}
          </li>
        ))}
      </ul>
    </section>
  );
}
