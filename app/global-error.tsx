"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>OmniLede is unavailable</title>
        <meta content="noindex,nofollow" name="robots" />
      </head>
      <body style={{ background: "#111516", color: "#efece3", fontFamily: "system-ui, sans-serif" }}>
        <main className="mx-auto max-w-3xl px-5 py-24 text-center">
          <h1 className="font-serif text-5xl font-semibold">OmniLede is temporarily unavailable.</h1>
          <p className="mt-5 text-muted">
            The application encountered an unexpected error
            {error.digest ? ` (reference ${error.digest})` : ""}.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-8 min-h-11 border border-ink px-5 font-semibold"
          >
            Reload the newsroom
          </button>
        </main>
      </body>
    </html>
  );
}
