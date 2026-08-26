import { z } from "zod";

import {
  MARKET_INDICES,
  type MarketQuote,
  type MarketSnapshot,
  type MarketSymbol,
} from "@/lib/market/types";

const REVALIDATE_SECONDS = 1_800;
const MAX_RESPONSE_CHARACTERS = 512 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

type MarketFetchLike = (
  input: string | URL | Request,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

interface MarketProviderOptions {
  fetchImpl?: MarketFetchLike;
  apiKey?: string;
  now?: Date;
}

const rawQuoteSchema = z
  .object({
    symbol: z.string(),
    price: z.number().finite().nonnegative(),
    change: z.number().finite(),
    changePercentage: z.number().finite().optional(),
    changesPercentage: z.number().finite().optional(),
    timestamp: z.number().int().positive().optional(),
  })
  .passthrough()
  .refine(
    (quote) => quote.changePercentage !== undefined || quote.changesPercentage !== undefined,
    { message: "change percentage is required" },
  );

function unavailable(message: string): MarketSnapshot {
  return { status: "unavailable", quotes: [], asOf: null, delayed: true, message };
}

function isMarketSymbol(value: string): value is MarketSymbol {
  return MARKET_INDICES.some(({ symbol }) => symbol === value);
}

function labelFor(symbol: MarketSymbol): string {
  return MARKET_INDICES.find((index) => index.symbol === symbol)!.label;
}

function normalizeQuote(value: unknown, now: Date): MarketQuote | null {
  const parsed = rawQuoteSchema.safeParse(value);
  if (!parsed.success || !isMarketSymbol(parsed.data.symbol)) {
    return null;
  }
  const timestamp = parsed.data.timestamp
    ? new Date(parsed.data.timestamp * 1_000)
    : now;
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  return {
    symbol: parsed.data.symbol,
    label: labelFor(parsed.data.symbol),
    value: parsed.data.price,
    change: parsed.data.change,
    changePercent:
      parsed.data.changePercentage ?? parsed.data.changesPercentage ?? 0,
    timestamp: timestamp.toISOString(),
  };
}

export async function fetchMarketSnapshot(
  options: MarketProviderOptions = {},
): Promise<MarketSnapshot> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return unavailable("Market data is unavailable because no provider key is configured.");
  }
  const fetchImpl = options.fetchImpl ?? (fetch as MarketFetchLike);
  const now = options.now ?? new Date();
  const url = new URL("https://financialmodelingprep.com/stable/quote");
  url.searchParams.set("symbol", MARKET_INDICES.map(({ symbol }) => symbol).join(","));
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return unavailable(`Market provider returned HTTP ${response.status}.`);
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARACTERS) {
      return unavailable("Market provider response exceeded the safety limit.");
    }
    const payload: unknown = JSON.parse(text);
    if (!Array.isArray(payload)) {
      return unavailable("Market provider returned an unexpected response.");
    }

    const bySymbol = new Map<MarketSymbol, MarketQuote>();
    for (const value of payload) {
      const quote = normalizeQuote(value, now);
      if (quote && !bySymbol.has(quote.symbol)) {
        bySymbol.set(quote.symbol, quote);
      }
    }
    const quotes = MARKET_INDICES.flatMap(({ symbol }) => {
      const quote = bySymbol.get(symbol);
      return quote ? [quote] : [];
    });
    if (quotes.length === 0) {
      return unavailable("No valid index quotes were returned by the market provider.");
    }
    const asOf = quotes.reduce(
      (latest, quote) => (quote.timestamp > latest ? quote.timestamp : latest),
      quotes[0]!.timestamp,
    );
    return {
      status: quotes.length === MARKET_INDICES.length ? "available" : "partial",
      quotes,
      asOf,
      delayed: true,
      ...(quotes.length === MARKET_INDICES.length
        ? {}
        : { message: "Some index quotes are currently unavailable." }),
    };
  } catch {
    return unavailable("Market data is temporarily unavailable.");
  }
}
