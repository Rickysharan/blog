export type TrendDatum = { label: string; value: number };
export function TrendChart({ title, points }: { title: string; points: TrendDatum[] }) {
  const max = Math.max(...points.map(({ value }) => value), 1);
  const coords = points.map(({ value }, index) => `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${100 - (value / max) * 90}`).join(" ");
  return <section className="report-panel"><h2>{title}</h2>
    {points.length ? <><svg className="trend-chart" role="img" aria-labelledby="trend-title" viewBox="0 0 100 100" preserveAspectRatio="none"><title id="trend-title">{title}</title><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
      <table className="sr-report-table"><caption>{title} data</caption><thead><tr><th>Period</th><th>Value</th></tr></thead><tbody>{points.map((point) => <tr key={point.label}><th>{point.label}</th><td>{point.value}</td></tr>)}</tbody></table></> : <p>No verified trend rows were returned.</p>}
  </section>;
}
