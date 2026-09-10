import { requireAdmin } from "../../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminContributorsPage() {
  await requireAdmin();
  const { data } = await createServiceSupabaseClient().from("profiles").select("id,display_name,country_code,account_status,version,updated_at").order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { id: string; display_name: string; country_code: string | null; account_status: string; version: number; updated_at: string }[];
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Contributor administration</p><h1>People and account status.</h1><p>Suspensions, bans, and restores require a reason and leave an immutable audit trail.</p></div><div className="article-list">{rows.map((row) => <section className="article-row" key={row.id}><span className="article-row__status">{row.account_status}</span><h2>{row.display_name}</h2><p>{row.country_code ?? "Country not set"} · version {row.version} · {row.id}</p></section>)}</div></div>;
}
