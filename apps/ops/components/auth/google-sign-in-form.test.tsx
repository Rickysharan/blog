import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { GoogleSignInForm } from "./google-sign-in-form";

afterEach(() => {
  delete window.__OMNILEDE_NATIVE__;
  delete window.webkit;
});

test("marks Google sign-in as native only inside the installed Mac app", () => {
  window.__OMNILEDE_NATIVE__ = { available: true };
  window.webkit = { messageHandlers: { omnilede: { postMessage: vi.fn() } } };

  render(<GoogleSignInForm action={vi.fn()} />);

  expect(screen.getByTestId("native-google-sign-in")).toHaveValue("1");
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
});
