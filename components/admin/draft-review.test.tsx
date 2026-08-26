import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseArticleFile } from "@/lib/content/schema";
import type { DraftDocument } from "@/lib/drafts/types";
import { makeValidMdx } from "@/tests/helpers/temp-content";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { DraftReview } from "@/components/admin/draft-review";

function draft(): DraftDocument {
  const mdx = makeValidMdx();
  const article = parseArticleFile(mdx, "story.mdx");
  return {
    ref: { category: "anime", filename: "story.mdx" },
    title: article.title,
    date: article.date,
    excerpt: article.excerpt,
    category: article.category,
    version: "version-one",
    mdx,
    article,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("DraftReview", () => {
  it("keeps invalid MDX in the editor and shows a frontmatter error", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<DraftReview initialDrafts={[draft()]} />);
    const editor = screen.getByLabelText(/mdx content/i);

    await user.clear(editor);
    await user.type(editor, "invalid draft text");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/frontmatter/i);
    expect(editor).toHaveValue("invalid draft text");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before discard", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<DraftReview initialDrafts={[draft()]} />);

    await user.click(screen.getByRole("button", { name: /^discard$/i }));

    const dialog = screen.getByRole("dialog", { name: /discard draft/i });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText(/permanently removes/i)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves edits and explains a version conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: "conflict", message: "Draft changed; refresh before trying again." },
        { status: 409 },
      ),
    );
    render(<DraftReview initialDrafts={[draft()]} />);
    const editor = screen.getByLabelText(/mdx content/i);
    const edited = `${makeValidMdx()}\n`;

    fireEvent.change(editor, { target: { value: edited } });
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/refresh/i);
    expect(editor).toHaveValue(edited);
  });

  it("publishes only after confirmation and removes the completed draft", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ articlePath: "content/articles/anime/story.mdx" }),
    );
    render(<DraftReview initialDrafts={[draft()]} />);

    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    const dialog = screen.getByRole("dialog", { name: /publish draft/i });
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: /publish now/i }));

    expect(await screen.findByText(/no drafts are waiting/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/drafts/anime/story.mdx",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"action":"publish"'),
      }),
    );
  });
});
