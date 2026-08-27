import Link from "next/link";

export const metadata = {
  title: "You’re offline",
  description: "OmniLede is waiting for your connection to return.",
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-5 py-20 sm:px-8">
      <div className="border-y border-line py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">No connection</p>
        <h1 className="mt-4 max-w-xl font-serif text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-7xl">
          The signal will return.
        </h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-muted">
          Previously opened stories may still be available. Reconnect and try again for the latest reporting.
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
          href="/"
        >
          Return to the front page
        </Link>
      </div>
    </main>
  );
}
