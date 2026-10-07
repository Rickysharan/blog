import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioShell } from "./studio-shell";

const pathname = vi.hoisted(() => ({ value: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)} /> }));

beforeEach(() => { pathname.value = "/today"; });

describe("StudioShell", () => {
  it("keeps a stable compact desktop rail and marks the current prefetched destination", () => {
    render(<StudioShell operatorEmail="ricky@example.com"><p>Workspace</p></StudioShell>);
    const sidebar = screen.getByRole("complementary");
    const desktop = screen.getByRole("navigation", { name: "Studio navigation" });
    expect(sidebar).toHaveAttribute("data-expanded", "false");
    expect(screen.getByTestId("studio-shell")).toHaveAttribute("data-layout", "compact-rail");
    expect(within(desktop).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(within(desktop).getByText("T")).toBeVisible();
    for (const link of within(desktop).getAllByRole("link")) expect(link).toHaveAttribute("data-prefetch", "true");
  });

  it("expands by pointer or focus, pins without shifting the shell, and closes outside or on Escape", () => {
    render(<StudioShell operatorEmail="ricky@example.com"><p>Workspace</p></StudioShell>);
    const sidebar = screen.getByRole("complementary");
    fireEvent.pointerEnter(sidebar);
    expect(sidebar).toHaveAttribute("data-expanded", "true");
    fireEvent.pointerLeave(sidebar);
    expect(sidebar).toHaveAttribute("data-expanded", "false");

    const today = within(sidebar).getByRole("link", { name: "Today" });
    fireEvent.focus(today);
    expect(sidebar).toHaveAttribute("data-expanded", "true");
    fireEvent.blur(today, { relatedTarget: document.body });
    expect(sidebar).toHaveAttribute("data-expanded", "false");

    const pin = within(sidebar).getByRole("button", { name: "Pin expanded navigation" });
    fireEvent.click(pin);
    fireEvent.pointerLeave(sidebar);
    expect(sidebar).toHaveAttribute("data-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(sidebar).toHaveAttribute("data-expanded", "false");
    fireEvent.click(pin);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(sidebar).toHaveAttribute("data-expanded", "false");
  });

  it("shows four phone destinations and traps focus inside the More menu", async () => {
    render(<StudioShell operatorEmail="ricky@example.com"><p>Workspace</p></StudioShell>);
    const phone = screen.getByRole("navigation", { name: "Studio phone navigation" });
    expect(within(phone).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "TToday", "CCategories", "DContent", "OOverview",
    ]);
    const more = within(phone).getByRole("button", { name: "More" });
    fireEvent.click(more);
    const dialog = screen.getByRole("dialog", { name: "More destinations" });
    expect(within(dialog).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "GGrowth", "SSearch", "RRevenue", "HHealth", "KConnect",
    ]);
    await waitFor(() => expect(within(dialog).getByRole("link", { name: "Growth" })).toHaveFocus());
    const last = within(dialog).getByRole("link", { name: "Connections" });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(within(dialog).getByRole("link", { name: "Growth" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("closes the phone More menu when a destination is selected", () => {
    render(<StudioShell operatorEmail="ricky@example.com"><p>Workspace</p></StudioShell>);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const dialog = screen.getByRole("dialog", { name: "More destinations" });
    fireEvent.click(within(dialog).getByRole("link", { name: "Growth" }));
    expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument();
  });
});
