import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ArticleEditor } from "./article-editor";

describe("ArticleEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

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

  test("omits the create-only id when submitting an existing draft", async () => {
    const existingSubmission = {
      id: "00000000-0000-4000-8000-000000000002",
      authorId: "00000000-0000-4000-8000-000000000001",
      title: "Existing draft",
      contentDocument: {
        type: "doc" as const,
        content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Original reporting" }] }]
      },
      category: "finance" as const,
      region: "global" as const,
      language: "en",
      primarySourceName: "Primary source",
      primarySourceUrl: "https://example.com/report",
      privateImagePath: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.webp",
      guidelinesVersion: "2026-08-27",
      guidelinesAccepted: true as const,
      status: "draft" as const,
      version: 1,
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
      submittedAt: null
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      submission: { ...existingSubmission, status: "under_review", version: 2 }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ArticleEditor userId={existingSubmission.authorId} submissionId={existingSubmission.id} initialSubmission={existingSubmission} />);

    await user.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("id");
    expect(body.submit).toBe(true);
  });
});
