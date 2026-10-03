import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { TaskList } from "./task-list";

const fetcher = vi.fn();
const task = {
  id: "00000000-0000-4000-8000-000000000001", evidenceKey: "draft:sports:story.mdx", kind: "review" as const,
  title: "Review Sports draft", detail: "Draft waiting for review.", category: "sports" as const, state: "open" as const,
  priority: 80, source: "GitHub content", postponedUntil: null, completedAt: null,
  createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z"
};

beforeEach(() => { fetcher.mockReset(); });

it("keeps Today actions separate, refreshes tasks, and exposes phone-safe review links", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ tasks: [task] }));
  render(<TaskList initialTasks={[task]} fetcher={fetcher} />);
  expect(screen.getByRole("link", { name: /review content/i })).toHaveAttribute("href", "/content");
  expect(screen.getByText(/writing starts from the OmniLede Mac app/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /refresh tasks/i }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" })));
  expect(screen.queryByRole("button", { name: /start writing/i })).not.toBeInTheDocument();
});

it("completes a task only after the server accepts the action", async () => {
  fetcher.mockResolvedValueOnce(Response.json({ task: { ...task, state: "completed", completedAt: "2026-10-03T12:00:00.000Z" } }));
  render(<TaskList initialTasks={[task]} fetcher={fetcher} />);
  fireEvent.click(screen.getByRole("button", { name: /complete review sports draft/i }));
  await screen.findByText(/no open tasks/i);
  expect(fetcher).toHaveBeenCalledWith(`/api/tasks/${task.id}`, expect.objectContaining({ method: "PATCH" }));
});
