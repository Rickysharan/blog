import { requireAdmin } from "../../../../lib/auth/authorization";

export const dynamic = "force-dynamic";

export default async function AdminRedemptionsPage() {
  await requireAdmin();
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Future payouts</p><h1>No payout queue is active.</h1><p>Keep this page disabled while OmniLede is in $0 launch mode. No approval or payment action is available.</p></div></div>;
}
