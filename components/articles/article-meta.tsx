import { format } from "date-fns";

export function ArticleMeta({
  author,
  date,
  readTime,
}: {
  author: string;
  date: string;
  readTime: number;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{author}</span>
      <span aria-hidden="true">•</span>
      <time dateTime={date}>{format(new Date(`${date}T00:00:00Z`), "d MMMM yyyy")}</time>
      <span aria-hidden="true">•</span>
      <span>{readTime} min read</span>
    </p>
  );
}
