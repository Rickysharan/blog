import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

describe("author page", () => {
  it("describes Ricky Sharan's real editorial role and human review", async () => {
    const { default: AuthorPage } = await import("./page");
    render(await AuthorPage({ params: Promise.resolve({ slug: "ricky-sharan" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Ricky Sharan" })).toBeInTheDocument();
    expect(screen.getByText(/editor and publisher of OmniLede/i)).toBeInTheDocument();
    expect(screen.getByText(/local AI.*private drafts/i)).toBeInTheDocument();
    expect(screen.getByText(/reviews.*decides whether to publish/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/award-winning|correspondent|expert|degree/i);
  });
});
