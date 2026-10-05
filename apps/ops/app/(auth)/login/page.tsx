import { redirect } from "next/navigation";

import { parseStudioOperatorEnv, parseStudioOriginEnv } from "../../../lib/env";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const metadata = { title: "Sign in | OmniLede Studio" };

async function sendSignInLink() {
  "use server";

  let studioOrigin: string;
  let operatorEmail: string;
  try {
    studioOrigin = parseStudioOriginEnv({
      NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL,
      AUTH_ALLOWED_ORIGINS: process.env.AUTH_ALLOWED_ORIGINS
    }).NEXT_PUBLIC_STUDIO_URL;
    operatorEmail = parseStudioOperatorEnv({
      STUDIO_OPERATOR_EMAIL: process.env.STUDIO_OPERATOR_EMAIL
    }).STUDIO_OPERATOR_EMAIL;
  } catch {
    redirect("/login?error=unavailable");
  }

  const { error } = await (await createServerSupabaseClient()).auth.signInWithOtp({
    email: operatorEmail,
    options: {
      emailRedirectTo: new URL("/auth/callback?next=%2Foverview", studioOrigin).toString(),
      shouldCreateUser: false
    }
  });
  if (error) redirect("/login?error=unavailable");
  redirect("/login?sent=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="login-page" id="main-content">
      <section className="login-card" aria-labelledby="login-heading">
        <p className="eyebrow">Private newsroom control plane</p>
        <h1 id="login-heading">OmniLede Studio</h1>
        <p>Use a secure sign-in link sent to the configured operator email.</p>
        {query.sent === "1" ? <p role="status">Sign-in link sent. Open the email on this device to continue.</p> : null}
        {query.error ? <p role="alert">Sign-in is temporarily unavailable. Try again.</p> : null}
        <form action={sendSignInLink}>
          <button className="primary-action" type="submit">Email me a sign-in link</button>
        </form>
      </section>
    </main>
  );
}
