import { redirect } from "next/navigation";

import { AccountNav } from "../../components/account-nav";
import { SiteHeader } from "../../components/site-header";
import { requireIdentity } from "../../lib/auth/authorization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireIdentity();
  } catch {
    redirect("/login?next=%2Fdashboard");
  }

  return (
    <>
      <SiteHeader />
      <div className="account-shell">
        <aside className="account-shell__aside">
          <AccountNav />
        </aside>
        <main id="main-content" className="account-shell__main">
          {children}
        </main>
      </div>
    </>
  );
}
