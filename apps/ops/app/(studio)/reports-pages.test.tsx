import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ auth: vi.fn(), ga4: vi.fn(), search: vi.fn() }));
vi.mock("../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../lib/providers/ga4", () => ({ fetchGa4Report: d.ga4 }));
vi.mock("../../lib/providers/search-console", () => ({ fetchSearchReport: d.search }));
import GrowthPage from "./growth/page";
import SearchPage from "./search/page";

const fetchedAt = "2026-10-04T10:00:00.000Z";
const metric = { clicks: 3, impressions: 40, ctr: .075, position: 5 };
beforeEach(() => {
  vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" });
  d.ga4.mockResolvedValue({ source: "GA4", range: { start: "2026-09-07", end: "2026-10-04" }, fetchedAt, state: "connected", data: { summary: { activeUsers: 4, sessions: 5, views: 8, engagementRate: .5 }, trend: [{ date: "2026-10-04", activeUsers: 4, sessions: 5, views: 8, engagementRate: .5 }], channels: [{ name: "Organic", views: 8, sessions: 5 }], devices: [{ name: "mobile", views: 6, sessions: 4 }], countries: [{ name: "UK", views: 5, sessions: 3 }], landingPages: [{ name: "/a", views: 4, sessions: 2 }], articlePaths: [{ name: "/a", views: 4, sessions: 2 }] } });
  d.search.mockResolvedValue({ source: "Search Console", range: { start: "2026-09-07", end: "2026-10-04" }, fetchedAt, state: "connected", data: { summary: metric, trend: [{ key: "2026-10-04", ...metric }], queries: [{ key: "query", ...metric }], pages: [{ key: "https://example.com/a", previousClicks: 2, ...metric }], countries: [{ key: "gbr", ...metric }], devices: [{ key: "MOBILE", ...metric }], sitemaps: [{ path: "https://example.com/sitemap.xml", lastSubmitted: fetchedAt, pending: false, warnings: 0, errors: 0 }], inspections: [{ url: "https://example.com/a", verdict: "PASS", coverageState: "Indexed", robotsTxtState: "ALLOWED", indexingState: "INDEXING_ALLOWED", pageFetchState: "SUCCESSFUL", userCanonical: "https://example.com/a", googleCanonical: "https://example.com/a", lastCrawlTime: fetchedAt }] } });
});
it("renders every required GA4 dimension with per-block provenance", async () => { render(await GrowthPage({ searchParams: Promise.resolve({ range: "28d" }) })); for (const name of ["Daily views data", "Traffic channels", "Devices", "Countries", "Landing pages", "Article performance"]) expect(screen.getByRole("table", { name })).toBeInTheDocument(); expect(screen.getAllByText(/GA4 · connected/).length).toBeGreaterThanOrEqual(6); });
it("renders every required Search Console evidence dimension with per-block provenance", async () => { render(await SearchPage({ searchParams: Promise.resolve({ range: "28d" }) })); for (const name of ["Daily search clicks data", "Search queries", "Search pages", "Search countries", "Search devices", "Sitemap status", "URL inspection and canonical evidence"]) expect(screen.getByRole("table", { name })).toBeInTheDocument(); expect(screen.getAllByText(/Search Console · connected/).length).toBeGreaterThanOrEqual(8); });
