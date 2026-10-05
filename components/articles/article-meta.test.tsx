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
});
