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
  const unavailable = snapshot.quotes.length === 0;

  return (
    <section aria-labelledby="market-strip-heading" className="border-y border-brandInk/15 bg-brand text-brandInk">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-baseline gap-3 lg:w-44">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-signal" id="market-strip-heading">
            Market pulse
          </h2>
          {snapshot.asOf ? (
            <time className="text-[0.65rem] text-brandInk/55" dateTime={snapshot.asOf}>
              {new Date(snapshot.asOf).toLocaleTimeString("en-GB", {
                timeZone: "UTC",
                hour: "2-digit",
                minute: "2-digit",
              })} UTC
            </time>
          ) : null}
        </div>
        {unavailable ? (
          <p className="border-l border-brandInk/20 pl-4 text-sm font-semibold text-brandInk/75">
            Market update pending
          </p>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-y-4 sm:grid-cols-4">
            {MARKET_INDICES.map((index) => {
              const quote = snapshot.quotes.find(({ symbol }) => symbol === index.symbol);
              return (
                <div className="border-l border-brandInk/20 px-4" key={index.symbol}>
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-brandInk/55">{index.label}</p>
                  {quote ? (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
                      <span className="text-sm font-black text-brandInk sm:text-base">
                        {valueFormatter.format(quote.value)}
                      </span>
                      <span
                        aria-label={`${index.label} ${directionLabel(quote.changePercent)} ${percentFormatter.format(Math.abs(quote.changePercent))} percent`}
                        className={
                          quote.changePercent > 0
                            ? "text-xs font-bold text-green-300"
                            : quote.changePercent < 0
                              ? "text-xs font-bold text-red-300"
                              : "text-xs font-bold text-brandInk/60"
                        }
                      >
                        {quote.changePercent > 0 ? "+" : ""}
                        {percentFormatter.format(quote.changePercent)}%
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-brandInk/55">Pending</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[0.62rem] leading-4 text-brandInk/50 lg:max-w-44 lg:text-right">
          Data may be delayed. For information only; not investment advice.
        </p>
      </div>
    </section>
  );
}
