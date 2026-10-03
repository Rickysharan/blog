import Link from "next/link";

import type { CategorySummary } from "../../lib/editorial/category-summary";

export function CategoryTable({ summaries }: { summaries: CategorySummary[] }) {
  return (
    <section aria-label="Category coverage">
      <p className="native-note">Start writing is available in the OmniLede Mac app. Phone users can review and publish delivered drafts.</p>
      <div className="category-table-wrap">
        <table className="category-table">
          <thead><tr><th>Category</th><th>Published</th><th>Drafts</th><th>Latest</th><th>Views</th><th>Search clicks</th><th>Action</th></tr></thead>
          <tbody>{summaries.map((summary) => (
            <tr key={summary.category}>
              <th scope="row">{summary.label}</th><td>{summary.publishedCount}</td><td>{summary.draftCount}</td>
              <td>{summary.latestPublication ? new Date(summary.latestPublication).toLocaleDateString() : "No publication"}</td>
              <td>{summary.views.value ?? "Unavailable"}</td><td>{summary.clicks.value ?? "Unavailable"}</td>
              <td><Link href={`/content?category=${summary.category}`}>Review {summary.label}</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
