import { randomUUID } from "node:crypto";

import { requireIdentity } from "../../../lib/auth/authorization";
import { ArticleEditor } from "../../../components/editor/article-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit a story | OmniLede Contributor" };

export default async function SubmitPage() {
  const identity = await requireIdentity();
  return <ArticleEditor userId={identity.userId} submissionId={randomUUID()} />;
}
