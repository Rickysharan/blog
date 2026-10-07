import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ auth: vi.fn(), inventory: vi.fn(), tasks: vi.fn(), history: vi.fn(), health: vi.fn(), ga4: vi.fn(), search: vi.fn(), adsense: vi.fn() }));
vi.mock("../../lib/auth/operator", () => ({ requireStudioOperator: d.auth }));
vi.mock("../../lib/editorial/repository", () => ({ loadStudioEditorialInventory: d.inventory }));
vi.mock("../../lib/tasks/repository", () => ({ listTodayTasks: d.tasks }));
vi.mock("../../lib/publication/history", () => ({ listPublicationHistory: d.history }));
vi.mock("../../lib/health/site-health", async (original) => ({ ...(await original()), collectSiteHealth: d.health }));
vi.mock("../../lib/providers/ga4", () => ({ fetchGa4Report: d.ga4 }));
vi.mock("../../lib/providers/search-console", () => ({ fetchSearchReport: d.search }));
vi.mock("../../lib/providers/adsense", () => ({ fetchAdsenseReport: d.adsense }));

import CategoriesPage from "./categories/page";
import HealthPage from "./health/page";
import OverviewPage from "./overview/page";
import TodayPage from "./today/page";

const inventory = { source: "github", version: "a".repeat(40), items: [
  { kind: "published", category: "sports", filename: "story.mdx", slug: "story", date: "2026-10-01T00:00:00.000Z" },
  { kind: "draft", category: "sports", filename: "draft.mdx", slug: "draft", date: "2026-10-02T00:00:00.000Z" }
] };

beforeEach(() => {
  vi.resetAllMocks(); d.auth.mockResolvedValue({ userId: "operator" }); d.inventory.mockResolvedValue(inventory);
  d.tasks.mockResolvedValue([]); d.history.mockResolvedValue([]); d.health.mockResolvedValue([]);
  d.ga4.mockResolvedValue({ source: "Google Analytics Data API", fetchedAt: null, state: "unavailable", data: null });
  d.search.mockResolvedValue({ source: "Google Search Console API", fetchedAt: null, state: "unavailable", data: null });
  d.adsense.mockResolvedValue({ source: "Google AdSense Management API", fetchedAt: null, state: "unavailable", data: null });
});

it("keeps Overview source-backed and labels disconnected provider metrics unavailable", async () => {
  render(await OverviewPage());
  expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  expect(screen.getByText("Published articles").nextElementSibling).toHaveTextContent("1");
  expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText(/Google AdSense Management API · unavailable/)).toBeInTheDocument();
});

it("starts repository and provider reads together so a slow connector does not serialize Overview", async () => {
  let releaseAnalytics!: () => void;
  d.ga4.mockImplementationOnce(() => new Promise((resolve) => {
    releaseAnalytics = () => resolve(undefined);
  }));

  const page = OverviewPage();
  await vi.waitFor(() => expect(d.ga4).toHaveBeenCalledOnce());
  expect(d.inventory).toHaveBeenCalledOnce();
  expect(d.tasks).toHaveBeenCalledOnce();
  expect(d.history).toHaveBeenCalledOnce();
  releaseAnalytics();
  await page;
});

it("renders Today separately from category inventory", async () => {
  render(await TodayPage());
  expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Categories" })).not.toBeInTheDocument();
});

it("renders every category even when only Sports has content", async () => {
  d.tasks.mockResolvedValueOnce([{ id: "00000000-0000-4000-8000-000000000001", evidenceKey: "coverage:anime:none", kind: "writing", title: "Write Anime", detail: "No coverage", category: "anime", state: "open", priority: 70, source: "editorial", postponedUntil: null, completedAt: null, createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z" }]);
  render(await CategoriesPage());
  expect(screen.getAllByRole("row")).toHaveLength(7);
  expect(screen.getByRole("row", { name: /anime 0 0/i })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /sports 1 1/i })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /anime 0 0/i })).toHaveTextContent("open");
  expect(screen.getAllByText(/Google Analytics · unavailable · Never refreshed/)).toHaveLength(6);
  expect(screen.getAllByText("None")).toHaveLength(6);
});

it("renders the evidence-backed Site health view", async () => {
  d.health.mockResolvedValue([{ check: "origin", title: "Public origin", state: "healthy", evidence: "HTTP 200", affectedUrl: "https://example.com", checkedAt: "2026-10-03T12:00:00.000Z", severity: "ok", recoveryAction: "No action." }]);
  render(await HealthPage());
  expect(screen.getByRole("heading", { name: "Site health" })).toBeInTheDocument();
  expect(screen.getByText("HTTP 200")).toBeInTheDocument();
});
