import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

import { LoginForm } from "@/components/admin/login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
  });

  it("submits the password and redirects after a successful login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/password/i), "correct horse");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "correct horse" }),
      }),
    );
    expect(replace).toHaveBeenCalledWith("/admin/review");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a stable error without echoing the submitted password", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "Invalid password" }, { status: 401 }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/password/i), "do-not-echo-this");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign-in failed. Check the password and try again.");
    expect(alert).not.toHaveTextContent("do-not-echo-this");
  });
});
