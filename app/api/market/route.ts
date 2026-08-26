import { NextResponse } from "next/server";

import { fetchMarketSnapshot } from "@/lib/market/provider";

export const revalidate = 1_800;

export async function GET() {
  const snapshot = await fetchMarketSnapshot({ apiKey: process.env.STOCK_API_KEY });
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
