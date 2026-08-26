import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pagination } from "@/components/articles/pagination";

describe("Pagination", () => {
  it("marks the current page and omits impossible navigation", () => {
    render(
      <Pagination page={1} pageCount={3} basePath="/category/anime" />,
    );

    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("link", { name: /next page/i })).toHaveAttribute(
      "href",
      "/category/anime?page=2",
    );
    expect(screen.queryByRole("link", { name: /previous page/i })).toBeNull();
  });

  it("links backward without adding a page query for page one", () => {
    render(
      <Pagination page={2} pageCount={3} basePath="/category/anime" />,
    );

    expect(screen.getByRole("link", { name: /previous page/i })).toHaveAttribute(
      "href",
      "/category/anime",
    );
  });
});
