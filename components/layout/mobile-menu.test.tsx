import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileMenu } from "./mobile-menu";

vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));

describe("MobileMenu", () => {
  it("opens only after a click and includes all seven categories", () => {
    render(<MobileMenu />);
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Top 10" })).toHaveAttribute("href", "/category/top-10");
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });
});
