import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContactPage from "@/app/contact/page";

describe("ContactPage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not offer commercial enquiry types in preparation mode", async () => {
    vi.stubEnv("COMMERCIAL_FEATURES_ENABLED", "false");
    const page = await ContactPage({
      searchParams: Promise.resolve({ subject: "advertising" }),
    });

    render(page);

    expect(screen.getByLabelText(/enquiry type/i)).toHaveValue("general");
    expect(screen.queryByRole("option", { name: "Advertising" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Partnership" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Advertising and partnerships" })).toBeNull();
  });

  it("explains the advertising route selected by house ads", async () => {
    vi.stubEnv("COMMERCIAL_FEATURES_ENABLED", "true");
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
