import type { Category, Region } from "@omnilede/contracts";

import { REGION_LABELS } from "@/lib/region/preferences";

export function ContributorAttribution({
  category,
  contributorName,
  language,
  region,
}: {
  category: Category;
  contributorName: string;
  language: string;
  region: Region;
}) {
  const financialCategory = category === "finance" || category === "share-market";

  return (
    <aside className="mt-6 border-l-2 border-signal bg-panel px-5 py-4" aria-label="Contributor disclosure">
      <p className="text-sm font-semibold text-ink">Contributor article by {contributorName}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        {REGION_LABELS[region]} · {language}
      </p>
      <p className="mt-3 text-sm leading-6 text-muted">
        Published under OmniLede&apos;s non-exclusive contributor licence and reviewed by an OmniLede editor.
      </p>
      {financialCategory ? (
        <p className="mt-3 text-sm font-semibold leading-6 text-ink">
          Contributor views are not verified professional financial advice.
        </p>
      ) : null}
    </aside>
  );
}
