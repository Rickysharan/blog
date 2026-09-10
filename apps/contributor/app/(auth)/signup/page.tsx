import { AuthForm } from "../../../components/auth-form";
import { safeNext } from "../../../lib/auth/safe-next";

export const metadata = { title: "Join OmniLede | Contributor" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNext(params.next, new Request("https://contributors.invalid/signup")) : null;
  return <AuthForm mode="signup" next={next} />;
}
