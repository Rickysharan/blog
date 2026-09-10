import { requireIdentity } from "../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import { TopicClaimButton } from "../../../components/topic-claim-button";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  await requireIdentity();
  const { data } = await createServiceSupabaseClient().from("trending_topics").select("id,title,category,trend_score,active,updated_at").eq("active", true).order("trend_score", { ascending: false }).limit(30);
  const rows = (data ?? []) as { id: string; title: string; category: string; trend_score: number; updated_at: string }[];
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Global topic board</p><h1>Choose a useful lead.</h1><p>Claims reserve a topic briefly; they never copy source prose and expire automatically.</p></div><div className="article-list">{rows.length === 0 ? <section className="empty-card"><h2>No active topics yet.</h2><p>New RSS signals will appear after the next free-tier import.</p></section> : rows.map((row) => <section className="article-row" key={row.id}><span className="article-row__status">{row.category} · trend {row.trend_score}</span><h2>{row.title}</h2><p>Claim window: 7 days · source metadata only</p><TopicClaimButton topicId={row.id} /></section>)}</div></div>;
}
