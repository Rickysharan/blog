import { format } from "date-fns";
import Link from "next/link";

export function ArticleMeta({
  author,
  authorHref,
  date,
  modifiedDate,
  readTime,
}: {
  author: string;
  authorHref?: string;
  date: string;
  modifiedDate?: string;
  readTime: number;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {authorHref ? <Link href={authorHref} itemProp="author" rel="author">{author}</Link> : <span itemProp="author">{author}</span>}
      <span aria-hidden="true">•</span>
      <span>
        Published <time itemProp={modifiedDate && modifiedDate !== date ? "datePublished" : "datePublished dateModified"} dateTime={date}>{format(new Date(`${date}T00:00:00Z`), "d MMMM yyyy")}</time>
      </span>
      {modifiedDate && modifiedDate !== date ? (
        <>
          <span aria-hidden="true">•</span>
          <span>
            Updated <time itemProp="dateModified" dateTime={modifiedDate}>{format(new Date(`${modifiedDate}T00:00:00Z`), "d MMMM yyyy")}</time>
          </span>
        </>
      ) : null}
      <span aria-hidden="true">•</span>
      <span>{readTime} min read</span>
    </p>
  );
}
