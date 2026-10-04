import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MetricCard } from "./metric-card";
import { TrendChart } from "./trend-chart";
import { DataTable } from "./data-table";
it("labels unavailable values without synthesizing zero", () => { render(<MetricCard label="Clicks" value={null} source="Google Search Console" fetchedAt={null} state="unavailable"/>); expect(screen.getByText("Unavailable")).toBeInTheDocument(); expect(screen.queryByText("0")).not.toBeInTheDocument(); });
it("provides an accessible chart and exact table fallback with visible provenance", () => { render(<TrendChart title="Daily views" points={[{ label: "Mon", value: 3 }, { label: "Tue", value: 7 }]} source="GA4" fetchedAt="2026-10-04T10:00:00Z" state="stale"/>); expect(screen.getByRole("img", { name: "Daily views" })).toBeInTheDocument(); expect(screen.getByRole("table", { name: "Daily views data" })).toHaveTextContent("Mon3Tue7"); expect(screen.getByText(/GA4.*stale/i)).toBeInTheDocument(); });
it("labels every data table with source, fetch time and provider state", () => { render(<DataTable caption="Devices" columns={["Device", "Views"]} rows={[["mobile", 8]]} source="GA4" fetchedAt="2026-10-04T10:00:00Z" state="connected"/>); expect(screen.getByText(/GA4.*connected/i)).toBeInTheDocument(); expect(screen.getByText(/Fetched/i)).toBeInTheDocument(); });
