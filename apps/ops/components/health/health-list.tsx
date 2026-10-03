import type { SiteHealthFinding } from "../../lib/health/site-health";

export function HealthList({ findings }: { findings: SiteHealthFinding[] }) {
  return (
    <ul className="health-list">
      {findings.map((finding) => (
        <li className={`health-card health-${finding.severity}`} key={finding.check}>
          <div><span>{finding.state}</span><h2>{finding.title}</h2></div>
          <p>{finding.evidence}</p>
          <p>Affected: <a href={finding.affectedUrl} rel="noreferrer" target="_blank">{finding.affectedUrl}</a></p>
          <p>Checked: <time dateTime={finding.checkedAt}>{new Date(finding.checkedAt).toLocaleString()}</time></p>
          <strong>Recovery: {finding.recoveryAction}</strong>
        </li>
      ))}
    </ul>
  );
}
