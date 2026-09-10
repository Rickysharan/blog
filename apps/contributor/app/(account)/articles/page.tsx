import Link from "next/link";

import { requireIdentity } from "../../../lib/auth/authorization";
import { listSubmissions } from "../../../lib/submissions/repository";

export const dynamic = "force-dynamic";
export const metadata = { title: "My articles | OmniLede Contributor" };

export default async function ArticlesPage() {
  const identity = await requireIdentity();
  const submissions = await listSubmissions(identity.userId);
  return (
    <div className="account-page">
      <div className="page-heading"><p className="eyebrow">Your desk</p><h1>Article history.</h1><p>Every version stays visible to you. Provider evidence is reserved for reviewers.</p></div>
      <div className="article-list">
        {submissions.length === 0 ? <section className="empty-card"><h2>No drafts yet.</h2><p>Start with a global signal and a primary source.</p><Link className="button button-primary" href="/submit">Open the editor ↗</Link></section> : submissions.map((submission) => (
          <Link className="article-row" href={`/articles/${submission.id}`} key={submission.id}>
            <span className="article-row__status">{submission.status.replace("_", " ")}</span>
            <h2>{submission.title}</h2>
            <p>{submission.category} · updated {new Date(submission.updatedAt).toLocaleDateString("en-GB")}</p>
            <span className="article-row__arrow">↗</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
