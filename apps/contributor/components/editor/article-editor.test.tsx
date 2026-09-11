import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  test("updates the visible count when the story body changes", async () => {
    const rect = {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 0,
      width: 0,
      x: 0,
      y: 0
    };
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => []
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => rect
    });
    Object.defineProperty(Text.prototype, "getClientRects", {
      configurable: true,
      value: () => []
    });
    Object.defineProperty(Text.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => rect
    });
    const user = userEvent.setup();
    render(<ArticleEditor userId="00000000-0000-4000-8000-000000000001" submissionId="00000000-0000-4000-8000-000000000002" />);

    const story = within(screen.getByRole("region", { name: "Story body" })).getByRole("textbox");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => story
    });
    await user.type(story, "Clear global signal");

    expect(screen.getByText("3 words · 19 characters")).toBeVisible();
  });

  test("does not turn an unchecked guideline attestation into an accepted one", async () => {
    const user = userEvent.setup();
    render(<ArticleEditor userId="00000000-0000-4000-8000-000000000010" submissionId="00000000-0000-4000-8000-000000000020" />);

    await user.type(screen.getByLabelText("Headline"), "Unsubmitted draft");

    await waitFor(() => {
      const raw = window.localStorage.getItem(
        "omnilede:contributor:draft:00000000-0000-4000-8000-000000000010:00000000-0000-4000-8000-000000000020"
      );
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? "{}").payload.guidelinesAccepted).toBe(false);
    });
  });
});
