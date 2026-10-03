import Link from "next/link";

import { CATEGORIES } from "@omnilede/editorial";

import type { CategorySummary } from "../../lib/editorial/category-summary";
import { NativeWriterControls } from "../native/writer-controls";

export function CategoryTable({ summaries }: { summaries: CategorySummary[] }) {
  const metric = (item: CategorySummary["views"]) => (
    <div className="category-metric">
      <strong>{item.value ?? "Unavailable"}</strong>
      <small>{item.source} · {item.state} · {item.fetchedAt ? `Updated ${new Date(item.fetchedAt).toLocaleString()}` : "Never refreshed"}</small>
    </div>
  );
  return (
    <section aria-label="Category coverage">
      <div className="category-table-wrap">
        <table className="category-table">
          <thead><tr><th>Category</th><th>Published</th><th>Drafts</th><th>Latest</th><th>Coverage age</th><th>Task</th><th>Views</th><th>Search clicks</th><th>Warnings</th><th>Action</th></tr></thead>
          <tbody>{summaries.map((summary) => (
            <tr key={summary.category}>
              <th scope="row">{summary.label}</th><td>{summary.publishedCount}</td><td>{summary.draftCount}</td>
              <td>{summary.latestPublication ? new Date(summary.latestPublication).toLocaleDateString() : "No publication"}</td>
              <td>{summary.coverageAgeDays === null ? "No coverage" : `${summary.coverageAgeDays} days`}</td>
              <td>{summary.taskState ?? "No current task"}</td>
              <td>{metric(summary.views)}</td><td>{metric(summary.clicks)}</td>
              <td>{summary.warnings.length ? <ul>{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : "None"}</td>
              <td><Link href={`/content?category=${summary.category}`}>Review {summary.label}</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <NativeWriterControls categories={CATEGORIES} />
    </section>
  );
}
