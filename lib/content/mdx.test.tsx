import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderArticleMdx } from "@/lib/content/mdx";

describe("renderArticleMdx", () => {
  it("renders editorial headings and safe external links", async () => {
    const content = await renderArticleMdx(
      "## Why it matters\n\nRead the [primary source](https://example.com/story).",
    );

    render(content);

    expect(
      screen.getByRole("heading", { name: "Why it matters", level: 2 }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "primary source" })).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("rejects MDX import statements", async () => {
    await expect(
      renderArticleMdx('import Secret from "./secret"\n\n<Secret />'),
    ).rejects.toThrow(/imports are not allowed/i);
  });
});
