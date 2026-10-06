"use client";

import { useSyncExternalStore } from "react";

import { hasNativeWriter } from "../../lib/native/bridge";
import { SignInSubmit } from "./sign-in-submit";

const subscribeToStaticNativeCapability = () => () => {};

export function GoogleSignInForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const nativeAvailable = useSyncExternalStore(subscribeToStaticNativeCapability, hasNativeWriter, () => false);
  return (
    <form action={action}>
      <input data-testid="native-google-sign-in" type="hidden" name="native" value={nativeAvailable ? "1" : "0"} />
      <SignInSubmit idleLabel="Continue with Google" pendingLabel="Opening Google…" />
    </form>
  );
}
