"use client";

export default function AccountError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p className="eyebrow">Desk unavailable</p>
      <h1>We couldn’t load this workspace.</h1>
      <button className="button button--ink" onClick={() => reset()} type="button">
        Try again
      </button>
    </div>
  );
}
