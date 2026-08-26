import { MARKET_INDICES, type MarketSnapshot } from "@/lib/market/types";

const valueFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function directionLabel(changePercent: number): string {
  if (changePercent > 0) {
    return "up";
  }
  if (changePercent < 0) {
    return "down";
  }
  return "unchanged at";
}

export function MarketStrip({ snapshot }: { snapshot: MarketSnapshot }) {
  return (
    <section aria-labelledby="market-strip-heading" className="border-y border-line bg-panel/70">
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-ink" id="market-strip-heading">
            Global markets
          </h2>
          <p className="text-xs text-muted">
            Market data may be delayed · For information only; not investment advice.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
          {MARKET_INDICES.map((index) => {
            const quote = snapshot.quotes.find(({ symbol }) => symbol === index.symbol);
            return (
              <div className="bg-canvas px-4 py-4" key={index.symbol}>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">{index.label}</p>
                {quote ? (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
                    <span className="text-lg font-black text-ink">
                      {valueFormatter.format(quote.value)}
                    </span>
                    <span
                      aria-label={`${index.label} ${directionLabel(quote.changePercent)} ${percentFormatter.format(Math.abs(quote.changePercent))} percent`}
                      className={
                        quote.changePercent > 0
                          ? "text-sm font-bold text-green-700 dark:text-green-300"
                          : quote.changePercent < 0
                            ? "text-sm font-bold text-red-700 dark:text-red-300"
                            : "text-sm font-bold text-muted"
                      }
                    >
                      {quote.changePercent > 0 ? "+" : ""}
                      {percentFormatter.format(quote.changePercent)}%
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-semibold text-muted">Unavailable</p>
                )}
              </div>
            );
          })}
        </div>
        {snapshot.asOf ? (
          <p className="mt-2 text-right text-[0.7rem] text-muted">
            As of <time dateTime={snapshot.asOf}>{new Date(snapshot.asOf).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</time>
          </p>
        ) : null}
      </div>
    </section>
  );
}
