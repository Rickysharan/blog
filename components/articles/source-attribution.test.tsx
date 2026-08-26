import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceAttribution } from "@/components/articles/source-attribution";

describe("SourceAttribution", () => {
  it("renders a visible, safely isolated source link", () => {
    render(
      <SourceAttribution
        name="International IDEA"
        url="https://www.idea.int/data-tools/data/electoral-system-design-database"
      />,
    );

    expect(screen.getByText(/^Source:/)).toBeVisible();
    expect(screen.getByRole("link", { name: "International IDEA" })).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });
});
