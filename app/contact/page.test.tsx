import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContactPage from "@/app/contact/page";

describe("ContactPage", () => {
  it("explains the advertising route selected by house ads", async () => {
    const page = await ContactPage({
      searchParams: Promise.resolve({ subject: "advertising" }),
    });

    render(page);

    expect(
      screen.getByRole("heading", { name: "Advertising and partnerships" }),
    ).toBeVisible();
    expect(screen.getByText(/campaign goals, target desks and flight dates/i)).toBeVisible();
  });
});
