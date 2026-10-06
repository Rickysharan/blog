import { redirect } from "next/navigation";

import { GoogleSignInForm } from "../../../components/auth/google-sign-in-form";
import { SignInSubmit } from "../../../components/auth/sign-in-submit";
import { classifyOtpError } from "../../../lib/auth/otp-errors";
import { parseStudioOperatorEnv, parseStudioOriginEnv } from "../../../lib/env";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const metadata = { title: "Sign in | OmniLede Studio" };

async function signInWithGoogle(formData: FormData) {
  "use server";

  let studioOrigin: string;
  try {
    studioOrigin = parseStudioOriginEnv({
      NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL,
      AUTH_ALLOWED_ORIGINS: process.env.AUTH_ALLOWED_ORIGINS
    }).NEXT_PUBLIC_STUDIO_URL;
  } catch {
    redirect("/login?error=unavailable");
  }

  const { data, error } = await (await createServerSupabaseClient()).auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL(formData.get("native") === "1" ? "/auth/native/relay" : "/auth/callback", studioOrigin).toString()
    }
  });
  if (error || !data.url) redirect("/login?error=unavailable");
  redirect(data.url);
}

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
      emailRedirectTo: new URL("/auth/callback", studioOrigin).toString(),
      shouldCreateUser: false
    }
  });
  if (error) redirect(`/login?error=${classifyOtpError(error)}`);
  redirect("/login?sent=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; external?: string }> }) {
  const query = await searchParams;
  return (
    <main className="login-page" id="main-content">
      <section className="login-card" aria-labelledby="login-heading">
        <p className="eyebrow">Private newsroom control plane</p>
        <h1 id="login-heading">OmniLede Studio</h1>
        <p>Sign in with Google, or use a secure email link as a backup.</p>
        {query.sent === "1" ? <p role="status">Sign-in link sent. Open the email on this device to continue.</p> : null}
        {query.external === "1" ? <p role="status">Finish signing in in your browser. OmniLede will return here automatically.</p> : null}
        {query.error === "cooldown" ? <p role="alert">A link was requested recently. Check your email or wait one minute before trying again.</p> : null}
        {query.error && query.error !== "cooldown" ? <p role="alert">Sign-in is temporarily unavailable. Try again.</p> : null}
        <GoogleSignInForm action={signInWithGoogle} />
        <p className="login-divider">or</p>
        <form action={sendSignInLink}>
          <SignInSubmit />
        </form>
      </section>
    </main>
  );
}
