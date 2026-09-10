import { AuthForm } from "../../../components/auth-form";
import { safeNext } from "../../../lib/auth/safe-next";

export const metadata = { title: "Sign in | OmniLede Contributor" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNext(params.next, new Request("https://contributors.invalid/login")) : null;
  return <AuthForm mode="login" next={next} />;
}
