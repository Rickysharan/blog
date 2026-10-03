import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateDraftMdx } from "@omnilede/editorial";
import { makeValidMdx } from "../../../../packages/editorial/src/test-fixtures";
import { ContentWorkspace } from "./content-workspace";
const ref = { category: "anime", filename: "story.mdx" } as const;
const mdx = makeValidMdx();
const draft = { ref, category: "anime" as const, version: "a".repeat(40), mdx, title: "A Valid Editorial Draft", date: "2026-08-25", excerpt: "Editorial story", article: validateDraftMdx(ref, mdx) };
const second = { ...draft, ref: { category: "movies" as const, filename: "film.mdx" }, category: "movies" as const, title: "A movie update", date: "2026-09-01" };
const history = [{ actor_id: "operator", action: "publish" as const, category: "sports" as const, content_ref: "sports/final.mdx", prior_version: "c".repeat(40), resulting_version: "d".repeat(40), commit_url: "https://github.com/owner/repo/commit/ddd", created_at: "2026-09-02T12:00:00Z" }];
const fetcher = vi.fn();
beforeEach(() => { fetcher.mockReset(); fetcher.mockImplementation(async (_url, options) => options?.method === "POST" ? Response.json({ draft: { ...draft, version: "b".repeat(40), mdx: JSON.parse(options.body).mdx } }) : Response.json({ draft, drafts: [draft, second], history })); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.unstubAllGlobals());
async function openEditor() { render(<ContentWorkspace initialDrafts={[draft, second]} initialHistory={history} publicSiteUrl="https://omnilede.example" />); fireEvent.click(screen.getByRole("button", { name: draft.title })); return screen.findByRole("textbox", { name: "MDX content" }); }
it("filters category, date, text and state without publishing", async () => {
  render(<ContentWorkspace initialDrafts={[draft, second]} initialHistory={history} />);
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "movies" } }); expect(screen.queryByRole("button", { name: draft.title })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: second.title })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "all" } });
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-01" } }); expect(screen.queryByRole("button", { name: draft.title })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search content"), { target: { value: "nonexistent" } }); expect(screen.queryByRole("button", { name: second.title })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search content"), { target: { value: "" } }); fireEvent.change(screen.getByLabelText("State"), { target: { value: "published" } }); expect(screen.queryByRole("button", { name: second.title })).not.toBeInTheDocument(); expect(screen.getByText("sports/final.mdx")).toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
});
it("loads and previews safely without publishing, and explains private Save", async () => {
  const editor = await openEditor(); fireEvent.change(editor, { target: { value: mdx.replace("## What happened", "## Reviewed heading") } }); fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.getByRole("heading", { name: "Reviewed heading" })).toBeInTheDocument(); expect(screen.getByText("Save keeps this draft private. Only Publish makes it public.")).toBeInTheDocument(); expect(fetcher.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
});
it("saves exact editor bytes privately and uses the returned version next time", async () => {
  const editor = await openEditor(); const edited = mdx + "\n\n"; fireEvent.change(editor, { target: { value: edited } }); fireEvent.click(screen.getByRole("button", { name: "Save private draft" })); await screen.findByText("Draft saved. It is still private.");
  let posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST"); expect(JSON.parse(posts[0][1].body)).toEqual({ action: "save", mdx: edited, expectedVersion: "a".repeat(40) });
  fireEvent.click(screen.getByRole("button", { name: "Save private draft" })); await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2)); posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST"); expect(JSON.parse(posts[1][1].body).expectedVersion).toBe("b".repeat(40));
});
it.each(["conflict", "network"])("retains text and loaded version after %s, including a list refresh", async failure => {
  const editor = await openEditor(); const edited = mdx + "\nMy local changes"; fireEvent.change(editor, { target: { value: edited } });
  fetcher.mockImplementationOnce(async () => { if (failure === "network") throw new Error("offline"); return Response.json({ code: "conflict" }, { status: 409 }); });
  fireEvent.click(screen.getByRole("button", { name: "Save private draft" })); await screen.findByRole("alert"); expect(editor).toHaveValue(edited);
  fetcher.mockResolvedValueOnce(Response.json({ drafts: [{ ...draft, version: "e".repeat(40) }], history })); fireEvent.click(screen.getByRole("button", { name: "Refresh list" })); await waitFor(() => expect(screen.getByRole("button", { name: "Refresh list" })).not.toBeDisabled()); expect(editor).toHaveValue(edited);
  fireEvent.click(screen.getByRole("button", { name: "Save private draft" })); await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2)); expect(JSON.parse(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")[1][1].body).expectedVersion).toBe("a".repeat(40));
});
it("requires title, category and loaded-version confirmation before publishing the frozen reviewed bytes", async () => {
  const editor = await openEditor(); const edited = mdx + "\n\n"; fireEvent.change(editor, { target: { value: edited } }); fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByText("Publish these exact reviewed bytes to the public site and remove this draft from the private queue.")).toBeInTheDocument(); const publish = within(dialog).getByRole("button", { name: "Publish now" }); expect(publish).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Confirm article title"), { target: { value: draft.title } }); fireEvent.change(within(dialog).getByLabelText("Confirm category"), { target: { value: "anime" } }); expect(publish).toBeDisabled(); fireEvent.click(within(dialog).getByRole("checkbox"));
  fetcher.mockResolvedValueOnce(Response.json({ result: { articlePath: "content/articles/anime/story.mdx", commitUrl: "https://github.com/owner/repo/commit/bbb" }, event: history[0] })); fireEvent.click(publish); await screen.findByText("Article published. The public site will update after deployment.");
  expect(JSON.parse(fetcher.mock.calls.find(([, init]) => init?.method === "POST")![1].body)).toEqual({ action: "publish", mdx: edited, expectedVersion: draft.version, confirmedTitle: draft.title, confirmedCategory: "anime" }); expect(screen.getByRole("link", { name: "View public article" })).toHaveAttribute("href", "https://omnilede.example/article/story"); expect(screen.getByRole("link", { name: "View publication commit" })).toHaveAttribute("href", "https://github.com/owner/repo/commit/bbb");
});
it("cancelling confirmation never mutates", async () => { await openEditor(); fireEvent.click(screen.getByRole("button", { name: "Publish…" })); fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(fetcher.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true); });
it("opens publication confirmation as a native modal without pre-opening it", async () => {
  const showModal = vi.fn(function(this: HTMLDialogElement) { if (this.open) throw new Error("Already open dialogs cannot become modal"); this.setAttribute("open", ""); });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  try { await openEditor(); fireEvent.click(screen.getByRole("button", { name: "Publish…" })); expect(showModal).toHaveBeenCalledOnce(); expect(screen.getByRole("dialog")).toHaveAttribute("open"); }
  finally { delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal; }
});
it("renders MDX expressions and HTML as inert preview text", async () => {
  const editor = await openEditor(); fireEvent.change(editor, { target: { value: '<script>window.hacked = true</script>\n\n{fetch("/api/content/drafts", {method: "POST"})}' } }); fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.getByRole("region", { name: "Article preview" }).querySelector("script")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retains an actionable unrecorded discard receipt after a history failure and list refresh", async () => {
  await openEditor();
  const receipt = { actor_id: "operator", action: "discard", category: "anime", content_ref: "anime/story.mdx", prior_version: draft.version, resulting_version: "b".repeat(40), commit_url: `https://github.com/owner/repo/commit/${"b".repeat(40)}`, created_at: "2026-10-03T12:00:00Z" };
  fetcher.mockResolvedValueOnce(Response.json({ result: { version: receipt.resulting_version, commitUrl: receipt.commit_url }, historyWarning: "The action succeeded, but history could not be recorded. Do not repeat the action.", reconciliation: receipt }));
  fireEvent.click(screen.getByRole("button", { name: "Discard…" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: draft.title })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "MDX content" })).not.toBeInTheDocument();
  const unrecorded = screen.getByRole("region", { name: "Action receipts awaiting history reconciliation" });
  expect(unrecorded).toHaveTextContent("discard");
  expect(unrecorded).toHaveTextContent("anime/story.mdx");
  expect(unrecorded).toHaveTextContent(draft.version);
  expect(unrecorded).toHaveTextContent(receipt.resulting_version);
  expect(within(unrecorded).getByRole("link", { name: "View committed action" })).toHaveAttribute("href", receipt.commit_url);
  expect(unrecorded).toHaveTextContent("not recorded in publication history");
  fetcher.mockResolvedValueOnce(Response.json({ drafts: [second], history }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh list" })).not.toBeDisabled());
  expect(screen.getByRole("region", { name: "Action receipts awaiting history reconciliation" })).toHaveTextContent(receipt.resulting_version);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
