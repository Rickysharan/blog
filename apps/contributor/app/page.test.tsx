import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContributorPage from "./(public)/page";

describe("ContributorPage", () => {
  it("presents the global newsroom heading and launch mode", () => {
    render(<ContributorPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Make the world’s signal clearer." })
    ).toBeInTheDocument();
    expect(screen.getByText("$0 launch mode")).toBeInTheDocument();
  });
});
