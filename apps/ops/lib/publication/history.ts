import "server-only";
import type { CategorySlug } from "@omnilede/editorial/categories";
import { createServiceSupabaseClient } from "../supabase/server";

export type PublicationEvent = {
  id?: string;
  actor_id: string;
  action: "save" | "publish" | "discard";
  category: CategorySlug;
  content_ref: string;
  prior_version: string;
  resulting_version: string | null;
  commit_url: string | null;
  created_at: string;
};
const columns = "id,actor_id,action,category,content_ref,prior_version,resulting_version,commit_url,created_at";
export async function listPublicationHistory(): Promise<PublicationEvent[]> {
  const { data, error } = await createServiceSupabaseClient().from("publication_events").select(columns).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Publication history unavailable");
  return (data ?? []) as PublicationEvent[];
}
export async function appendPublicationEvent(event: PublicationEvent): Promise<void> {
  // Explicit allowlist: callers cannot persist article bytes or credentials.
  const { actor_id, action, category, content_ref, prior_version, resulting_version, commit_url, created_at } = event;
  const { error } = await createServiceSupabaseClient().from("publication_events").insert({ actor_id, action, category, content_ref, prior_version, resulting_version, commit_url, created_at });
  if (error) throw new Error("Publication history unavailable");
}
