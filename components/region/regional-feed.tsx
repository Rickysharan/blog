"use client";

import { useId, useMemo, useState } from "react";

import { ArticleListItem } from "@/components/articles/article-list-item";
import { RegionControl } from "@/components/region/region-control";
import type { ArticleSummary } from "@/lib/content/schema";
import {
  GLOBAL_SELECTION,
  orderArticlesForSelection,
  type RegionSelection,
} from "@/lib/region/preferences";

export function RegionalFeed({
  articles,
  heading,
  intro = "Reviewed reporting stays global-first while regional and language matches move closer to the top.",
}: {
  articles: readonly ArticleSummary[];
  heading: string;
  intro?: string;
}) {
  const headingId = useId();
  const [selection, setSelection] = useState<RegionSelection>(GLOBAL_SELECTION);
  const ordered = useMemo(
    () => orderArticlesForSelection(articles, selection),
    [articles, selection],
  );

  return (
    <section aria-labelledby={headingId} className="[content-visibility:auto]">
      <div className="grid gap-4 border-b-2 border-ink pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">Newsroom wire</p>
          <h2 id={headingId} className="mt-1 font-serif text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            {heading}
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-muted sm:text-right">{intro}</p>
      </div>
      <div className="mt-4">
        <RegionControl onSelectionChange={setSelection} />
      </div>
      {ordered.length > 0 ? (
        ordered.map((article) => <ArticleListItem key={article.slug} article={article} />)
      ) : (
        <p className="border-b border-line py-10 text-sm leading-6 text-muted">
          More reviewed reporting is being prepared. New stories appear after editorial approval.
        </p>
      )}
    </section>
  );
}
