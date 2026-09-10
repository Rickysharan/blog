import Link from "next/link";
import { notFound } from "next/navigation";

import { requireIdentity } from "../../../../lib/auth/authorization";
import { getSubmission } from "../../../../lib/submissions/repository";
import { ArticleEditor } from "../../../../components/editor/article-editor";

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireIdentity();
  const { id } = await params;
  const submission = await getSubmission(identity.userId, id);
  if (!submission) notFound();
  const editable = submission.status === "draft" || submission.status === "changes_requested";
  return (
    <div className="account-page">
      <div className="page-heading"><p className="eyebrow">Article {submission.version}</p><h1>{submission.title}</h1><p>{submission.status.replace("_", " ")} · {submission.category} · {submission.region}</p></div>
      {editable ? <ArticleEditor userId={identity.userId} submissionId={submission.id} initialSubmission={submission} /> : <section className="settings-card"><h2>This version is {submission.status.replace("_", " ")}.</h2><p>Your personal timeline remains available. If an editor requests changes, this story will reopen for a new version.</p><Link className="text-link" href="/articles">Back to article history →</Link></section>}
    </div>
  );
}
