import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../../../lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import LoginPage from "./page";

test("offers Google sign-in with email link fallback", async () => {
  render(await LoginPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});
