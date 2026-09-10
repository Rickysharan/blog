import { requireIdentity } from "../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const identity = await requireIdentity();
  const service = createServiceSupabaseClient();
  const [{ data: account }, { data: transactions }] = await Promise.all([
    service.from("wallet_accounts").select("balance_points,version,updated_at").eq("user_id", identity.userId).maybeSingle(),
    service.from("wallet_transactions").select("id,transaction_kind,amount_points,balance_after,source_ref,created_at").eq("wallet_user_id", identity.userId).order("created_at", { ascending: false }).limit(50)
  ]);
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Points beta</p><h1>Your ledger, clearly.</h1><p>Points recognize useful contributions during launch. They are not money and have no guaranteed cash value.</p></div><section className="wallet-balance"><span>Current points</span><strong>{account?.balance_points ?? 0}</strong><small>$0 launch mode · no cash redemption</small></section><div className="article-list">{(transactions ?? []).length === 0 ? <section className="empty-card"><h2>No transactions yet.</h2><p>Approval and publication events will appear here as immutable ledger entries.</p></section> : (transactions ?? []).map((row) => <section className="settings-card" key={row.id}><p className="article-row__status">{row.transaction_kind} · {new Date(row.created_at).toLocaleDateString("en-GB")}</p><h2>{row.amount_points > 0 ? "+" : ""}{row.amount_points} points</h2><p>Balance after: {row.balance_after}{row.source_ref ? ` · ${row.source_ref}` : ""}</p></section>)}</div></div>;
}
