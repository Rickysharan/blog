import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketStrip } from "@/components/market/market-strip";
import type { MarketSnapshot } from "@/lib/market/types";

describe("MarketStrip", () => {
  it("shows signed moves with accessible direction and disclosure", () => {
    const snapshot: MarketSnapshot = {
      status: "partial",
      asOf: "2026-08-26T10:00:00.000Z",
      delayed: true,
      quotes: [
        {
          symbol: "^NSEI",
          label: "Nifty 50",
          value: 25001.1,
          change: 100.2,
          changePercent: 0.4,
          timestamp: "2026-08-26T09:55:00.000Z",
        },
        {
          symbol: "^GSPC",
          label: "S&P 500",
          value: 6200.25,
          change: -4.5,
          changePercent: -0.07,
          timestamp: "2026-08-26T09:55:00.000Z",
        },
      ],
    };

    render(<MarketStrip snapshot={snapshot} />);

    expect(screen.getByText("25,001.1")).toBeVisible();
    expect(screen.getByLabelText(/Nifty 50 up 0.4 percent/i)).toBeVisible();
    expect(screen.getByLabelText(/S&P 500 down 0.07 percent/i)).toBeVisible();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText(/delayed/i)).toBeVisible();
    expect(screen.getByText(/not investment advice/i)).toBeVisible();
  });

  it("renders all requested labels without fake values when unavailable", () => {
    render(
      <MarketStrip
        snapshot={{ status: "unavailable", quotes: [], asOf: null, delayed: true }}
      />,
    );

    for (const label of ["Nifty 50", "Sensex", "S&P 500", "Nasdaq Composite"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
  });
});
