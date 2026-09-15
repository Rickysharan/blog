import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryNav } from "@/components/layout/category-nav";

describe("CategoryNav", () => {
  it("links all six desks in stable editorial order", () => {
    render(<CategoryNav />);

    expect(
      screen
        .getAllByRole("link")
        .map((link) => ({ label: link.getAttribute("aria-label"), href: link.getAttribute("href") })),
    ).toEqual([
      { label: "Anime", href: "/category/anime" },
      { label: "Movies", href: "/category/movies" },
      { label: "Politics", href: "/category/politics" },
      { label: "Sports", href: "/category/sports" },
      { label: "Finance", href: "/category/finance" },
      { label: "Share Market", href: "/category/share-market" },
    ]);
    expect(screen.getByRole("link", { name: "Anime" })).toHaveTextContent("01Anime");
    expect(screen.getByRole("link", { name: "Share Market" })).toHaveTextContent("06Share Market");
  });
});
