"use client";

import { useFormStatus } from "react-dom";

export function SignInSubmit({
  idleLabel = "Email me a sign-in link",
  pendingLabel = "Sending secure link…",
}: {
  idleLabel?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-action" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
