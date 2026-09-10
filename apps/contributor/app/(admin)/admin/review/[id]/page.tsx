import { notFound } from "next/navigation";

import { requireReviewer } from "../../../../../lib/auth/authorization";
import { createServiceSupabaseClient } from "../../../../../lib/supabase/server";
import { ReviewDecisionForm } from "../../../../../components/admin/review-decision-form";

export const dynamic = "force-dynamic";

export default async function AdminReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReviewer();
  const { id } = await params;
  const { data } = await createServiceSupabaseClient().from("submissions").select("id,title,content_document,category,region,language,primary_source_name,primary_source_url,status,version,created_at").eq("id", id).maybeSingle();
  if (!data) notFound();
  const row = data as { id: string; title: string; content_document: { content?: unknown[] }; category: string; region: string; language: string; primary_source_name: string; primary_source_url: string; status: string; version: number; created_at: string };
  return <div className="account-page"><div className="page-heading"><p className="eyebrow">{row.status.replace("_", " ")} · version {row.version}</p><h1>{row.title}</h1><p>{row.category} · {row.region} · {row.language}</p></div><section className="settings-card"><h2>Source contract</h2><p>{row.primary_source_name} · <a href={row.primary_source_url} rel="nofollow noopener noreferrer">Open primary source ↗</a></p><p>Review the source and visible article text. Provider evidence is bounded and never a legal originality guarantee.</p></section><ReviewDecisionForm submissionId={row.id} expectedVersion={row.version} /></div>;
}
