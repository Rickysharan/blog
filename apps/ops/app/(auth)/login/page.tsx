import { redirect } from "next/navigation";

import { parseStudioOriginEnv } from "../../../lib/env";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const metadata = { title: "Sign in | OmniLede Studio" };

async function signInWithGoogle() {
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
      redirectTo: new URL("/auth/callback?next=%2Foverview", studioOrigin).toString()
    }
  });
  if (error || !data.url) redirect("/login?error=unavailable");
  redirect(data.url);
}

export default function LoginPage() {
  return (
    <main className="login-page" id="main-content">
      <section className="login-card" aria-labelledby="login-heading">
        <p className="eyebrow">Private newsroom control plane</p>
        <h1 id="login-heading">OmniLede Studio</h1>
        <p>Sign in with the configured Google operator account.</p>
        <form action={signInWithGoogle}>
          <button className="primary-action" type="submit">Continue with Google</button>
        </form>
      </section>
    </main>
  );
}
