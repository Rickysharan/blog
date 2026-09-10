import { redirect } from "next/navigation";

import { AccountNav } from "../../../components/account-nav";
import { SiteHeader } from "../../../components/site-header";
import { requireReviewer } from "../../../lib/auth/authorization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireReviewer();
  } catch {
    redirect("/login?next=%2Fadmin%2Freview");
  }

  return (
    <>
      <SiteHeader />
      <div className="account-shell account-shell--admin">
        <aside className="account-shell__aside">
          <AccountNav />
          <p className="admin-badge">Reviewer desk · private</p>
        </aside>
        <main id="main-content" className="account-shell__main">
          {children}
        </main>
      </div>
    </>
  );
}
