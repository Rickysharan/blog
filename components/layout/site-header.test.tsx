import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";

describe("SiteHeader", () => {
  it("identifies the retro masthead as a numbered global edition", () => {
    render(<SiteHeader />);

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("bg-canvas", "text-ink");
    expect(screen.getByText("Global edition · Vol. 01")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "News desks" }).closest(".bg-signal")).not.toBeNull();
    expect(screen.getByRole("button", { name: /theme:/i })).toHaveClass("border-ink/20", "text-ink");
  });
});
