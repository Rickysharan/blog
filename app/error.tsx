"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
        Newsroom interruption
      </p>
      <h1 className="mt-3 font-serif text-5xl font-semibold tracking-[-0.04em]">
        We could not load this page.
      </h1>
      <p className="mx-auto mt-5 max-w-xl leading-7 text-muted">
        Please try again. If the problem continues, return to the homepage.
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <button
        aria-describedby="error-guidance"
        type="button"
        onClick={reset}
        className="mt-8 min-h-11 border border-ink px-5 font-semibold hover:bg-ink hover:text-paper"
      >
        Try again
      </button>
      <p className="sr-only" id="error-guidance">
        Retries the page without submitting editorial or account data.
      </p>
    </main>
  );
}
