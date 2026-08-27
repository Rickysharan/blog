"use client";

import Link from "next/link";

export function ConsentBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <section
      aria-labelledby="consent-heading"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl border border-line border-t-4 border-t-signal bg-canvas p-5 shadow-2xl sm:inset-x-6 sm:p-6"
    >
      <h2 className="text-lg font-black text-ink" id="consent-heading">
        Your privacy choices
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        OmniLede uses essential storage for your theme and sign-in. With your permission, it can also load analytics and advertising services. You can change this choice later in the footer. Read the{" "}
        <Link className="font-semibold underline" href="/privacy">
          privacy policy
        </Link>
        .
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          className="min-h-11 bg-brand px-5 py-3 font-bold text-brandInk transition-colors hover:text-signal"
          onClick={onAccept}
          type="button"
        >
          Accept optional cookies
        </button>
        <button
          className="min-h-11 border-2 border-ink px-5 py-3 font-bold text-ink transition-colors hover:border-signal"
          onClick={onDecline}
          type="button"
        >
          Decline optional cookies
        </button>
      </div>
    </section>
  );
}
