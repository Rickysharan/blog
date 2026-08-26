import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DraftReview } from "@/components/admin/draft-review";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { DraftConfigurationError, getDraftRepository } from "@/lib/drafts/repository";
import { DraftRepositoryError, type DraftDocument } from "@/lib/drafts/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft review",
  robots: { index: false, follow: false },
};

export default async function AdminReviewPage() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!secret || secret.length < 32 || !token || !(await verifySessionToken(token, secret))) {
    redirect("/admin/login");
  }

  let drafts: DraftDocument[] = [];
  let storageError = "";
  try {
    const repository = getDraftRepository();
    const summaries = await repository.list();
    drafts = await Promise.all(summaries.map(({ ref }) => repository.read(ref)));
  } catch (error) {
    storageError =
      error instanceof DraftConfigurationError || error instanceof DraftRepositoryError
        ? "Draft storage is temporarily unavailable. Check the server configuration or repository status."
        : "The review queue could not be loaded.";
  }

  return (
    <main className="mx-auto w-full max-w-[96rem] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">OmniLede editorial</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-ink">Draft review desk</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Edit source-grounded drafts here. Nothing becomes public until you confirm Publish.
        </p>
      </header>
      {storageError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-800 dark:text-red-200" role="alert">
          {storageError}
        </div>
      ) : (
        <DraftReview initialDrafts={drafts} />
      )}
    </main>
  );
}
