import Link from "next/link";

import { requireReviewer } from "../../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  await requireReviewer();
  const { data } = await createServiceSupabaseClient().from("submissions").select("id,title,category,status,version,created_at").in("status", ["under_review", "manual_review"]).order("created_at", { ascending: true });
  const rows = (data ?? []) as { id: string; title: string; category: string; status: string; version: number; created_at: string }[];
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">Review desk</p><h1>Stories waiting for a human read.</h1><p>Automated checks are evidence, not a verdict. Start with the oldest high-need item.</p></div><div className="article-list">{rows.length === 0 ? <section className="empty-card"><h2>Queue clear.</h2><p>New submissions will appear here after the contributor submits.</p></section> : rows.map((row) => <Link className="article-row" href={`/admin/review/${row.id}`} key={row.id}><span className="article-row__status">{row.status.replace("_", " ")}</span><h2>{row.title}</h2><p>{row.category} · version {row.version} · {new Date(row.created_at).toLocaleDateString("en-GB")}</p><span className="article-row__arrow">↗</span></Link>)}</div></div>;
}
