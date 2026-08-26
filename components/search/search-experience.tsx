"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import {
  normalizeSearchText,
  searchArticles,
  type SearchEntry,
} from "@/lib/content/search";

const INITIAL_RESULT_LIMIT = 12;

export function SearchExperience({ articles }: { articles: readonly SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const hasQuery = normalizeSearchText(deferredQuery).length > 0;
  const results = hasQuery
    ? searchArticles(articles, deferredQuery)
    : articles.slice(0, INITIAL_RESULT_LIMIT);

  return (
    <div>
      <label htmlFor="article-search" className="sr-only">
        Search published stories
      </label>
      <div className="flex items-center border-b-2 border-ink py-3">
        <Search aria-hidden="true" className="mr-3 shrink-0 text-muted" size={24} />
        <input
          id="article-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topics, authors, tags and desks"
          className="min-h-12 w-full bg-transparent font-serif text-xl outline-none placeholder:text-muted/70 sm:text-2xl"
        />
      </div>

      <p className="mt-4 text-sm text-muted" role="status" aria-live="polite">
        {hasQuery
          ? results.length > 0
            ? `${results.length} ${results.length === 1 ? "story" : "stories"} matched.`
            : `No stories matched “${deferredQuery.trim()}”.`
          : `Showing ${results.length} recent stories.`}
      </p>

      <div className="mt-8 divide-y divide-line border-y border-line">
        {results.map((article) => (
          <article key={article.slug} className="grid gap-2 py-6 sm:grid-cols-[9rem_1fr] sm:gap-8">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
              {article.categoryLabel}
            </div>
            <div>
              <h2 className="font-serif text-2xl font-semibold leading-tight tracking-[-0.025em]">
                <Link
                  href={`/article/${article.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {article.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{article.excerpt}</p>
              <p className="mt-3 text-xs text-muted">
                {article.author} · {article.readTime} min read
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
