import Link from "next/link";

function pageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

export function Pagination({
  page,
  pageCount,
  basePath,
}: {
  page: number;
  pageCount: number;
  basePath: string;
}) {
  return (
    <nav
      aria-label="Article archive pages"
      className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-6 text-sm"
    >
      <div>
        {page > 1 ? (
          <Link
            href={pageHref(basePath, page - 1)}
            rel="prev"
            className="font-semibold underline decoration-line underline-offset-4 hover:decoration-current"
          >
            Previous page
          </Link>
        ) : null}
      </div>
      <p aria-current="page" className="text-muted">
        Page {page} of {pageCount}
      </p>
      <div>
        {page < pageCount ? (
          <Link
            href={pageHref(basePath, page + 1)}
            rel="next"
            className="font-semibold underline decoration-line underline-offset-4 hover:decoration-current"
          >
            Next page
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
