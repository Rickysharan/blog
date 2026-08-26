import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">404</p>
      <h1 className="mt-3 font-serif text-5xl font-semibold tracking-[-0.04em]">
        This page is off the news desk.
      </h1>
      <p className="mx-auto mt-5 max-w-xl leading-7 text-muted">
        The address may have changed, or the story has not been published.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center border border-ink px-5 font-semibold hover:bg-ink hover:text-paper"
        >
          Return to the newsroom
        </Link>
        <Link
          href="/search"
          className="inline-flex min-h-11 items-center border border-line px-5 font-semibold hover:border-ink"
        >
          Search published stories
        </Link>
      </div>
    </main>
  );
}
