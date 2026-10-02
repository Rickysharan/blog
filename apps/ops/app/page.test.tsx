import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudioOperator: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  })
}));

vi.mock("../lib/auth/operator", () => ({ requireStudioOperator: mocks.requireStudioOperator }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));

import StudioLayout from "./(studio)/layout";
import manifest from "./manifest";
import HomePage from "./page";
import { StudioShell } from "../components/studio-shell";

const destinations = [
  ["Overview", "/overview"],
  ["Today", "/today"],
  ["Categories", "/categories"],
  ["Content", "/content"],
  ["Growth", "/growth"],
  ["Google Search", "/search"],
  ["Revenue", "/revenue"],
  ["Site health", "/health"]
] as const;

const identity = {
  userId: "00000000-0000-4000-8000-000000000002",
  email: "operator@example.com",
  aal: "aal1" as const,
  roles: ["admin" as const]
};

describe("OmniLede Studio entry and shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStudioOperator.mockResolvedValue(identity);
  });

  test("redirects the root to Overview for the configured operator", async () => {
    await expect(HomePage()).rejects.toThrow("REDIRECT:/overview");
    expect(mocks.redirect).toHaveBeenCalledWith("/overview");
  });

  test("redirects the root to login when authorization fails", async () => {
    mocks.requireStudioOperator.mockRejectedValue(new Error("denied"));

    await expect(HomePage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  test("checks operator authorization before rendering a private route", async () => {
    mocks.requireStudioOperator.mockRejectedValue(new Error("denied"));

    await expect(StudioLayout({ children: <p>Private report</p> })).rejects.toThrow("REDIRECT:/login");
    expect(screen.queryByText("Private report")).not.toBeInTheDocument();
  });

  test("renders every Studio destination in desktop and phone navigation", () => {
    render(<StudioShell operatorEmail={identity.email}><p>Workspace</p></StudioShell>);

    const desktop = screen.getByRole("navigation", { name: "Studio navigation" });
    const phone = screen.getByRole("navigation", { name: "Studio phone navigation" });
    for (const [name, href] of destinations) {
      expect(within(desktop).getByRole("link", { name })).toHaveAttribute("href", href);
      expect(within(phone).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  test("publishes a standalone OmniLede Studio manifest", () => {
    expect(manifest()).toMatchObject({
      name: "OmniLede Studio",
      short_name: "Studio",
      start_url: "/overview",
      display: "standalone"
    });
  });
});
