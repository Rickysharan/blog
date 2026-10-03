import type { DraftSummary } from "@omnilede/editorial/drafts/types";
import { ContentWorkspace } from "../../../components/content/content-workspace";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { createStudioContentRepository } from "../../../lib/content/repository";
import { listPublicationHistory, type PublicationEvent } from "../../../lib/publication/history";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  await requireStudioOperator();
  let data: { drafts: DraftSummary[]; history: PublicationEvent[]; publicSiteUrl?: string } | undefined;
  try {
    const [drafts, history] = await Promise.all([
      createStudioContentRepository().list(),
      listPublicationHistory()
    ]);
    const configured = process.env.NEXT_PUBLIC_BLOG_URL;
    const publicSiteUrl = configured && /^https:\/\//.test(configured) ? new URL(configured).origin : undefined;
    data = { drafts, history, publicSiteUrl };
  } catch {
    // Fail closed and keep provider errors out of the browser.
  }
  if (!data) {
    return (
      <div className="studio-page">
        <h1>Content</h1>
        <div className="studio-empty-state" role="alert">
          <p>Content is temporarily unavailable.</p>
          <span>Check the Studio content repository and publication history connection, then reload this page.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="studio-page">
      <p className="eyebrow">Editorial desk</p>
      <h1>Content</h1>
      <p className="studio-page-intro">Review the source, save privately, and publish only after confirming the exact article.</p>
      <ContentWorkspace initialDrafts={data.drafts} initialHistory={data.history} publicSiteUrl={data.publicSiteUrl} />
    </div>
  );
}
