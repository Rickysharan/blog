import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";

describe("SiteHeader", () => {
  it("keeps the masthead focused on the publication promise and desks", () => {
    render(<SiteHeader />);

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("bg-canvas", "text-ink");
    expect(
      screen.getByText("Independent reporting, visibly sourced."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Global edition · Vol. 01")).toBeNull();
    expect(screen.queryByText("World wide signal · 24/7")).toBeNull();
    expect(document.getElementById("desktop-news-desks")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: /theme:/i })).toHaveClass("border-ink/20", "text-ink");
    expect(screen.queryByRole("link", { name: /^advertise$/i })).toBeNull();
  });
});
