import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DesktopCategoryReveal } from "./desktop-category-reveal";

vi.mock("next/link", () => ({ default: ({ onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }} /> }));
vi.mock("@/components/pwa/install-app-button", () => ({ InstallAppButton: () => <button type="button">Install</button> }));
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => <button type="button">Theme</button> }));

describe("DesktopCategoryReveal", () => {
  it("reveals across the combined masthead region and closes after pointer leave", () => {
    render(<DesktopCategoryReveal />);
    const root = screen.getByTestId("desktop-category-reveal");
    const desks = document.getElementById("desktop-news-desks")!;
    expect(desks).toHaveAttribute("aria-hidden", "true");
    fireEvent.pointerEnter(root);
    expect(desks).toHaveAttribute("aria-hidden", "false");
    fireEvent.pointerLeave(root);
    expect(desks).toHaveAttribute("aria-hidden", "true");
  });

  it("pins from the existing menu control and closes on outside click or Escape", () => {
    render(<DesktopCategoryReveal />);
    const root = screen.getByTestId("desktop-category-reveal");
    const trigger = screen.getByRole("button", { name: "Open news desks" });
    const desks = document.getElementById("desktop-news-desks")!;
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", "desktop-news-desks");
    fireEvent.pointerLeave(root);
    expect(desks).toHaveAttribute("aria-hidden", "false");
    fireEvent.pointerDown(document.body);
    expect(desks).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(desks).toHaveAttribute("aria-hidden", "true");
  });

  it("stays open while keyboard focus moves into the horizontal links and closes on selection", () => {
    render(<DesktopCategoryReveal />);
    const theme = screen.getByRole("button", { name: "Theme" });
    const desks = document.getElementById("desktop-news-desks")!;
    const topTen = screen.getByRole("link", { name: "Top 10", hidden: true });
    fireEvent.focus(theme);
    expect(desks).toHaveAttribute("aria-hidden", "false");
    fireEvent.blur(theme, { relatedTarget: topTen });
    fireEvent.focus(topTen);
    expect(desks).toHaveAttribute("aria-hidden", "false");
    expect(topTen.closest("ul")).toHaveClass("grid-cols-7");
    fireEvent.click(topTen);
    expect(desks).toHaveAttribute("aria-hidden", "true");
  });
});
