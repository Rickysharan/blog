import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { CategoryTable } from "./categories/category-table";
import { HealthList } from "./health/health-list";
import { SourceCard } from "./overview/source-card";
import type { CategorySummary } from "../lib/editorial/category-summary";

it("renders unavailable source values explicitly", () => {
  render(<SourceCard label="Page views" value={null} state="disconnected" source="Google Analytics" refreshedAt={null} />);
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  expect(screen.getByText(/Google Analytics · Not connected/)).toBeInTheDocument();
});

it("renders all category facts with review links and Mac-only writing guidance", () => {
  const summaries = ["anime", "movies", "politics", "sports", "finance", "share-market"].map((category, index) => ({
    category, label: category, publishedCount: index, draftCount: 0, latestPublication: null, coverageAgeDays: null, taskState: null,
    views: { value: null, state: "unavailable", source: "Google Analytics", fetchedAt: null },
    clicks: { value: null, state: "unavailable", source: "Google Search Console", fetchedAt: null }, warnings: []
  })) as never;
  render(<CategoryTable summaries={summaries} />);
  expect(screen.getAllByRole("link", { name: /review/i })).toHaveLength(6);
  expect(screen.getByText(/Start writing is available in the OmniLede Mac app/i)).toBeInTheDocument();
});

it("renders category coverage age, task state, warnings, and sourced metric freshness", () => {
  const fetchedAt = "2026-10-03T12:00:00.000Z";
  const summary: CategorySummary = {
    category: "anime", label: "Anime", publishedCount: 2, draftCount: 1,
    latestPublication: "2026-09-29T00:00:00.000Z", coverageAgeDays: 4, taskState: "open",
    views: { value: 240, state: "connected", source: "Google Analytics", fetchedAt },
    clicks: { value: null, state: "unavailable", source: "Google Search Console", fetchedAt: null },
    warnings: ["Coverage needs review"]
  };
  render(<CategoryTable summaries={[summary]} />);
  expect(screen.getByText("4 days")).toBeInTheDocument();
  expect(screen.getByText("open")).toBeInTheDocument();
  expect(screen.getByText("Coverage needs review")).toBeInTheDocument();
  expect(screen.getByText(/Google Analytics · connected · Updated/)).toBeInTheDocument();
  expect(screen.getByText(/Google Search Console · unavailable · Never refreshed/)).toBeInTheDocument();
});

it("renders health evidence, affected URL, check time and recovery action", () => {
  render(<HealthList findings={[{ check: "robots", title: "Robots response", state: "critical", evidence: "HTTP 503", affectedUrl: "https://example.com/robots.txt", checkedAt: "2026-10-03T12:00:00.000Z", severity: "critical", recoveryAction: "Restore robots.txt." }]} />);
  expect(screen.getByText("HTTP 503")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "https://example.com/robots.txt" })).toBeInTheDocument();
  expect(screen.getByText(/Recovery: Restore robots\.txt\./)).toBeInTheDocument();
});
