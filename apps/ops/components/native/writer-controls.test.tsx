import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { CATEGORIES } from "@omnilede/editorial";
import { NativeWriterControls } from "./writer-controls";

const postMessage = vi.fn();

beforeEach(() => {
  postMessage.mockReset();
  delete window.__OMNILEDE_NATIVE__;
  delete window.webkit;
});

it("keeps writing unavailable in Safari and retains review and publish guidance", () => {
  render(<NativeWriterControls categories={CATEGORIES} />);
  expect(screen.queryByRole("button", { name: /start writing/i })).not.toBeInTheDocument();
  expect(screen.getByText(/review and publish delivered drafts/i)).toBeInTheDocument();
});

it("offers all six categories in the native app without writing on mount or refresh", async () => {
  window.__OMNILEDE_NATIVE__ = { available: true };
  window.webkit = { messageHandlers: { omnilede: { postMessage } } };
  const { rerender } = render(<NativeWriterControls categories={CATEGORIES} />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /start writing/i })).toHaveLength(6));
  expect(CATEGORIES.map(({ label }) => screen.getByRole("group", { name: label }))).toHaveLength(6);
  expect(postMessage).not.toHaveBeenCalled();
  rerender(<NativeWriterControls categories={CATEGORIES} refreshKey="new-inventory" />);
  expect(postMessage).not.toHaveBeenCalled();
});

it("starts only from the selected visible button and exposes safe progress", async () => {
  window.__OMNILEDE_NATIVE__ = { available: true };
  window.webkit = { messageHandlers: { omnilede: { postMessage } } };
  render(<NativeWriterControls categories={CATEGORIES} requestId={() => "request-12345678"} />);
  const sports = await screen.findByRole("group", { name: "Sports" });
  const start = within(sports).getByRole("button", { name: "Start writing Sports" });
  expect(start).toHaveAttribute("data-omnilede-native-action", "write");
  expect(start).toHaveAttribute("data-omnilede-category", "sports");
  fireEvent.click(start);
  expect(postMessage).toHaveBeenCalledTimes(1);
  expect(postMessage).toHaveBeenCalledWith({ action: "write", category: "sports", requestId: "request-12345678" });
  window.dispatchEvent(new CustomEvent("omnilede:native-status", { detail: {
    category: "sports", requestId: "request-12345678", phase: "generation", progress: 40,
    etaSeconds: 25, delivery: "pending", error: null, raw: "must not render"
  } }));
  expect(await within(sports).findByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  expect(within(sports).getByText(/25 seconds remaining/i)).toBeInTheDocument();
  expect(screen.queryByText("must not render")).not.toBeInTheDocument();
  window.dispatchEvent(new CustomEvent("omnilede:native-status", { detail: {
    category: "sports", requestId: "request-12345678", phase: "delivery-verification", progress: 100,
    etaSeconds: 0, delivery: "delivered", error: null,
  } }));
  expect(await within(sports).findByText(/draft delivered/i)).toBeInTheDocument();
  expect(within(sports).queryByText(/seconds remaining/i)).not.toBeInTheDocument();
});

it("shows Try again after a safe error and only retries after another click", async () => {
  window.__OMNILEDE_NATIVE__ = { available: true };
  window.webkit = { messageHandlers: { omnilede: { postMessage } } };
  render(<NativeWriterControls categories={CATEGORIES} requestId={() => "request-12345678"} />);
  const anime = await screen.findByRole("group", { name: "Anime" });
  fireEvent.click(within(anime).getByRole("button", { name: "Start writing Anime" }));
  postMessage.mockClear();
  window.dispatchEvent(new CustomEvent("omnilede:native-status", { detail: {
    category: "anime", requestId: "request-12345678", phase: "failed", progress: 15,
    etaSeconds: null, delivery: "not-delivered", error: "Writing needs attention. Try again."
  } }));
  expect(await within(anime).findByRole("button", { name: "Try again Anime" })).toBeInTheDocument();
  expect(postMessage).not.toHaveBeenCalled();
  fireEvent.click(within(anime).getByRole("button", { name: "Try again Anime" }));
  expect(postMessage).toHaveBeenCalledTimes(1);
});
