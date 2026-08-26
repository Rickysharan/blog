import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileMenu } from "@/components/layout/mobile-menu";

describe("MobileMenu", () => {
  it("opens accessibly and closes after choosing a desk", async () => {
    const user = userEvent.setup();
    render(<MobileMenu />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();

    await user.click(trigger);

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const animeLink = screen.getByRole("link", { name: "Anime" });
    animeLink.addEventListener("click", (event) => event.preventDefault());
    await user.click(animeLink);
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
  });
});
