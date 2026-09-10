import { requireAdmin } from "../../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireAdmin();
  const { data } = await createServiceSupabaseClient().from("audit_log").select("id,actor_type,action,target_type,reason,created_at").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; actor_type: string; action: string; target_type: string; reason: string | null; created_at: string }[];
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Governance</p><h1>Audit trail.</h1><p>Actions stay attributable with actor, reason, target, and timestamp.</p></div><div className="article-list">{rows.map((row) => <section className="settings-card" key={row.id}><p className="article-row__status">{row.action} · {row.target_type} · {row.actor_type}</p><p>{row.reason ?? "No reason recorded"}</p><small>{new Date(row.created_at).toISOString()}</small></section>)}</div></div>;
}
