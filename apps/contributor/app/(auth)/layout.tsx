import { SiteHeader } from "../../components/site-header";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <main className="auth-shell">{children}</main>
    </>
  );
}
