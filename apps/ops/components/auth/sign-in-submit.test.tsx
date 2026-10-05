import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { SignInSubmit } from "./sign-in-submit";

it("prevents another sign-in submission while the first is pending", async () => {
  const user = userEvent.setup();
  render(
    <form action={() => new Promise<void>(() => undefined)}>
      <SignInSubmit />
    </form>,
  );

  const button = screen.getByRole("button", { name: "Email me a sign-in link" });
  await user.click(button);

  expect(screen.getByRole("button", { name: "Sending secure link…" })).toBeDisabled();
});
