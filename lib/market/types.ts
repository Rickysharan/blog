export const MARKET_INDICES = [
  { symbol: "^NSEI", label: "Nifty 50" },
  { symbol: "^BSESN", label: "Sensex" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq Composite" },
] as const;

export type MarketSymbol = (typeof MARKET_INDICES)[number]["symbol"];

export interface MarketQuote {
  symbol: MarketSymbol;
  label: string;
  value: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface MarketSnapshot {
  status: "available" | "partial" | "unavailable";
  quotes: MarketQuote[];
  asOf: string | null;
  delayed: true;
  message?: string;
}
