import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryNav } from "@/components/layout/category-nav";

describe("CategoryNav", () => {
  it("links all seven desks in stable editorial order", () => {
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
      { label: "Top 10", href: "/category/top-10" },
    ]);
    expect(screen.getByRole("link", { name: "Anime" })).toHaveTextContent("01Anime");
    expect(screen.getByRole("link", { name: "Share Market" })).toHaveTextContent("06Share Market");
    expect(screen.getByRole("link", { name: "Top 10" })).toHaveTextContent("07Top 10");
  });
});
