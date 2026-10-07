import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArticleMeta } from "./article-meta";

describe("ArticleMeta", () => {
  it("renders machine-readable published and modified dates visibly", () => {
    render(<ArticleMeta author="OmniLede Editorial" date="2026-09-01" modifiedDate="2026-10-04" readTime={5} />);
    expect(screen.getByText(/Published/)).toHaveTextContent("Published 1 September 2026");
    expect(screen.getByText(/Updated/)).toHaveTextContent("Updated 4 October 2026");
    expect(document.querySelector('time[datetime="2026-09-01"]')).not.toBeNull();
    expect(document.querySelector('time[datetime="2026-10-04"]')).not.toBeNull();
  });

  it("links a registered author while leaving an unregistered contributor as text", () => {
    const { rerender } = render(<ArticleMeta author="Ricky Sharan" authorHref="/author/ricky-sharan" date="2026-10-08" readTime={4} />);
    expect(screen.getByRole("link", { name: "Ricky Sharan" })).toHaveAttribute("href", "/author/ricky-sharan");
    rerender(<ArticleMeta author="Ada Contributor" date="2026-10-08" readTime={4} />);
    expect(screen.queryByRole("link", { name: "Ada Contributor" })).not.toBeInTheDocument();
    expect(screen.getByText("Ada Contributor")).toBeInTheDocument();
  });
});
