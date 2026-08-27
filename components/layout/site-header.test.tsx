import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";

describe("SiteHeader", () => {
  it("uses a white editorial masthead with a mint navigation band", () => {
    render(<SiteHeader />);

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("bg-canvas", "text-ink");
    expect(screen.getByRole("navigation", { name: "News desks" }).closest(".bg-signal")).not.toBeNull();
    expect(screen.getByRole("button", { name: /theme:/i })).toHaveClass("border-ink/20", "text-ink");
  });
});
