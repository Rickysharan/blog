import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ArticleEditor } from "./article-editor";

describe("ArticleEditor", () => {
  test("exposes labelled story fields and an accessible formatting toolbar", () => {
    render(<ArticleEditor userId="00000000-0000-4000-8000-000000000001" submissionId="00000000-0000-4000-8000-000000000002" />);
    expect(screen.getByLabelText("Headline")).toBeVisible();
    expect(screen.getByLabelText("Primary source URL")).toBeVisible();
    expect(screen.getByRole("toolbar", { name: "Story formatting" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Heading level 2" })).toBeVisible();
    expect(screen.getByText(/own work/i)).toBeVisible();
  });
});
