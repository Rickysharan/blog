import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { NATIVE_PLAN_EVENT } from "../../lib/native/bridge";

import { TaskList } from "./task-list";

const fetcher = vi.fn();
const postMessage = vi.fn();
const task = {
  id: "00000000-0000-4000-8000-000000000001", evidenceKey: "draft:sports:story.mdx", kind: "review" as const,
  title: "Review Sports draft", detail: "Draft waiting for review.", category: "sports" as const, state: "open" as const,
  priority: 80, source: "GitHub content", postponedUntil: null, completedAt: null,
  createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z"
};

beforeEach(() => {
  fetcher.mockReset();
  postMessage.mockReset();
  delete window.__OMNILEDE_NATIVE__;
  delete window.webkit;
});

it("keeps Today actions separate, refreshes tasks, and exposes phone-safe review links", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ tasks: [task] }));
  render(<TaskList initialTasks={[task]} fetcher={fetcher} />);
  expect(screen.getByRole("link", { name: /review content/i })).toHaveAttribute("href", "/content");
  expect(screen.getByText(/writing starts from the OmniLede Mac app/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /refresh tasks/i }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" })));
  expect(screen.queryByRole("button", { name: /start writing/i })).not.toBeInTheDocument();
});

it("refreshes and consumes the read-only Mac daily plan only after an explicit native click", async () => {
  window.__OMNILEDE_NATIVE__ = { available: true };
  window.webkit = { messageHandlers: { omnilede: { postMessage } } };
  render(<TaskList initialTasks={[task]} fetcher={fetcher} nativeRequestId={() => "refresh-12345678"} />);
  expect(postMessage).not.toHaveBeenCalled();
  const refresh = screen.getByRole("button", { name: /refresh from this mac/i });
  expect(refresh).toHaveAttribute("data-omnilede-native-action", "refresh");
  fireEvent.click(refresh);
  expect(postMessage).toHaveBeenCalledWith({ action: "refresh", requestId: "refresh-12345678" });
  expect(fetcher).not.toHaveBeenCalled();
  window.dispatchEvent(new CustomEvent(NATIVE_PLAN_EVENT, { detail: {
    requestId: "refresh-12345678", date: "2026-10-03", completedCount: 1, totalTasks: 3,
    draftCount: 2, publishedCount: 24,
    tasks: [
      { category: "anime", label: "Anime", reason: "Least recent coverage", status: "todo" },
      { category: "sports", label: "Sports", reason: "Draft waiting for review", status: "draft-ready" },
      { category: "finance", label: "Finance", reason: "Saved work needs attention", status: "needs-attention" },
    ],
  } }));
  expect(await screen.findByRole("heading", { name: /mac daily plan/i })).toBeInTheDocument();
  expect(screen.getByText(/1 of 3 written/i)).toBeInTheDocument();
  expect(screen.getByText(/2 drafts · 24 published/i)).toBeInTheDocument();
  expect(screen.getAllByRole("listitem", { name: /mac plan/i })).toHaveLength(3);
  const animeStart = screen.getByRole("button", { name: /start writing anime/i });
  expect(animeStart).toHaveAttribute("data-omnilede-native-action", "write");
  expect(animeStart).toHaveAttribute("data-omnilede-category", "anime");
  expect(animeStart).toHaveAttribute("data-omnilede-plan-date", "2026-10-03");
  fireEvent.click(animeStart);
  expect(postMessage).toHaveBeenLastCalledWith({
    action: "write", category: "anime", planDate: "2026-10-03", requestId: "refresh-12345678",
  });
  expect(screen.getByRole("button", { name: /try again finance/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /start writing sports/i })).not.toBeInTheDocument();
});

it("accepts only this mounted instance's latest requested plan and shows refreshed outcomes", async () => {
  window.__OMNILEDE_NATIVE__ = { available: true };
  window.webkit = { messageHandlers: { omnilede: { postMessage } } };
  const first = render(<TaskList initialTasks={[task]} fetcher={fetcher} nativeRequestId={() => "first-refresh-1234"} />);
  fireEvent.click(screen.getByRole("button", { name: /refresh from this mac/i }));
  first.unmount();

  const ids = ["second-refresh-123", "third-refresh-1234"];
  render(<TaskList initialTasks={[task]} fetcher={fetcher} nativeRequestId={() => ids.shift()!} />);
  const stalePlan = {
    requestId: "first-refresh-1234", date: "2026-10-03", completedCount: 1, totalTasks: 3,
    draftCount: 2, publishedCount: 24,
    tasks: [
      { category: "anime", label: "Anime", reason: "Least recent coverage", status: "todo" },
      { category: "sports", label: "Sports", reason: "Draft waiting for review", status: "draft-ready" },
      { category: "finance", label: "Finance", reason: "Saved work needs attention", status: "needs-attention" },
    ],
  };
  window.dispatchEvent(new CustomEvent(NATIVE_PLAN_EVENT, { detail: stalePlan }));
  expect(screen.queryByRole("heading", { name: /mac daily plan/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /refresh from this mac/i }));
  window.dispatchEvent(new CustomEvent(NATIVE_PLAN_EVENT, { detail: stalePlan }));
  expect(screen.queryByRole("heading", { name: /mac daily plan/i })).not.toBeInTheDocument();
  window.dispatchEvent(new CustomEvent(NATIVE_PLAN_EVENT, { detail: { ...stalePlan, requestId: "second-refresh-123" } }));
  expect(await screen.findByText(/1 of 3 written/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /refresh from this mac/i }));
  window.dispatchEvent(new CustomEvent(NATIVE_PLAN_EVENT, { detail: {
    ...stalePlan, requestId: "third-refresh-1234", completedCount: 2,
    tasks: stalePlan.tasks.map((item) => item.category === "anime" ? { ...item, status: "draft-ready" } : item),
  } }));
  expect(await screen.findByText(/2 of 3 written/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /start writing anime/i })).not.toBeInTheDocument();
});

it("does not expose Mac planner refresh in an ordinary browser", () => {
  render(<TaskList initialTasks={[task]} fetcher={fetcher} />);
  expect(screen.queryByRole("button", { name: /refresh from this mac/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /start writing|try again/i })).not.toBeInTheDocument();
  expect(postMessage).not.toHaveBeenCalled();
});

it("completes a task only after the server accepts the action", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ task: { ...task, state: "completed", completedAt: "2026-10-03T12:00:00.000Z" } }));
  render(<TaskList initialTasks={[task]} fetcher={fetcher} />);
  fireEvent.click(screen.getByRole("button", { name: /complete review sports draft/i }));
  await screen.findByText(/no open tasks/i);
  expect(fetcher).toHaveBeenCalledWith(`/api/tasks/${task.id}`, expect.objectContaining({ method: "PATCH" }));
});
