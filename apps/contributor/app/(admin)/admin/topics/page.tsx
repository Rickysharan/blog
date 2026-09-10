import { requireAdmin } from "../../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminTopicsPage() {
  await requireAdmin();
  const { data } = await createServiceSupabaseClient().from("trending_topics").select("id,title,category,trend_score,active,updated_at").order("updated_at", { ascending: false }).limit(100);
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Topic governance</p><h1>Signals and claims.</h1><p>Import titles and metadata only. Contributors write original work from independently checked sources.</p></div><div className="article-list">{(data ?? []).map((row) => <section className="settings-card" key={row.id}><p className="article-row__status">{row.category} · {row.active ? "active" : "paused"}</p><h2>{row.title}</h2><p>Trend score: {row.trend_score}</p></section>)}</div></div>;
}
