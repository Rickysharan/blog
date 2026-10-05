"use client";

import { useFormStatus } from "react-dom";

export function SignInSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-action" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Sending secure link…" : "Email me a sign-in link"}
    </button>
  );
}
