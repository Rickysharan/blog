import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShareActions } from "@/components/articles/share-actions";

describe("ShareActions", () => {
  it("copies the canonical URL and announces success", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <ShareActions
        title="Story"
        url="https://example.com/article/story"
      />,
    );
    await user.click(screen.getByRole("button", { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith("https://example.com/article/story");
    expect(screen.getByRole("status")).toHaveTextContent(/copied/i);
  });

  it("encodes WhatsApp and X share links without changing the canonical URL", () => {
    render(
      <ShareActions
        title="Story & analysis"
        url="https://example.com/article/story?ref=canonical"
      />,
    );

    expect(screen.getByRole("link", { name: /share on whatsapp/i })).toHaveAttribute(
      "href",
      "https://wa.me/?text=Story+%26+analysis+https%3A%2F%2Fexample.com%2Farticle%2Fstory%3Fref%3Dcanonical",
    );
    expect(screen.getByRole("link", { name: /share on x/i })).toHaveAttribute(
      "href",
      "https://twitter.com/intent/tweet?text=Story+%26+analysis&url=https%3A%2F%2Fexample.com%2Farticle%2Fstory%3Fref%3Dcanonical",
    );
  });
});
