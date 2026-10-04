import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MetricCard } from "./metric-card";
import { TrendChart } from "./trend-chart";
it("labels unavailable values without synthesizing zero", () => { render(<MetricCard label="Clicks" value={null} source="Google Search Console" fetchedAt={null} state="unavailable"/>); expect(screen.getByText("Unavailable")).toBeInTheDocument(); expect(screen.queryByText("0")).not.toBeInTheDocument(); });
it("provides an accessible chart and exact table fallback", () => { render(<TrendChart title="Daily views" points={[{ label: "Mon", value: 3 }, { label: "Tue", value: 7 }]}/>); expect(screen.getByRole("img", { name: "Daily views" })).toBeInTheDocument(); expect(screen.getByRole("table", { name: "Daily views data" })).toHaveTextContent("Mon3Tue7"); });
