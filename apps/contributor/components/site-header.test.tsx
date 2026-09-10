import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { AccountNav } from "./account-nav";
import { SiteHeader } from "./site-header";

describe("Contributor navigation", () => {
  test("renders a semantic, keyboard-reachable site header", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /omnilede home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /join as contributor/i })).toHaveAttribute("href", "/signup");
  });

  test("marks the active account route and discloses the points-only launch mode", () => {
    render(<AccountNav activeHref="/dashboard" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/points beta/i)).toBeInTheDocument();
    expect(screen.getByText(/no cash redemption/i)).toBeInTheDocument();
  });
});
