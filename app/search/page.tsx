import type { Metadata } from "next";

import { SearchExperience } from "@/components/search/search-experience";
import { getAllArticles } from "@/lib/content/articles";
import { buildSearchIndex } from "@/lib/content/search";

export const metadata: Metadata = {
  title: "Search",
  description: "Search OmniLede stories by topic, author, tag or news desk.",
  alternates: { canonical: "/search" },
};

export default async function SearchPage() {
  const articles = await getAllArticles();

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          OmniLede archive
        </p>
        <h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
          Search the newsroom
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          Find published explainers across all six global desks. Drafts are never included.
        </p>
      </header>
      <div className="mt-10">
        <SearchExperience articles={buildSearchIndex(articles)} />
      </div>
    </main>
  );
}
