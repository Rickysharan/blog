import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OperationsPage from "./page";

describe("OperationsPage", () => {
  it("presents the OmniLede Operations heading and launch mode", () => {
    render(<OperationsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "OmniLede Operations" })
    ).toBeInTheDocument();
    expect(screen.getByText("$0 launch mode")).toBeInTheDocument();
  });
});
