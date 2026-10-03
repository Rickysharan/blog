import "server-only";

import { providerStateSchema, studioTaskInputSchema, studioTaskSchema, type ProviderState, type StudioTask, type StudioTaskInput } from "@omnilede/contracts";

import { createServiceSupabaseClient } from "../supabase/server";

type DbTask = {
  id: string; evidence_key: string; kind: string; title: string; detail: string | null; category: string | null;
  state: string; priority: number; source: string; postponed_until: string | null; completed_at: string | null;
  created_at: string; updated_at: string;
};

const columns = "id,evidence_key,kind,title,detail,category,state,priority,source,postponed_until,completed_at,created_at,updated_at";

function fromDb(row: DbTask): StudioTask {
  return studioTaskSchema.parse({
    id: row.id, evidenceKey: row.evidence_key, kind: row.kind, title: row.title, detail: row.detail,
    category: row.category, state: row.state, priority: row.priority, source: row.source,
    postponedUntil: row.postponed_until, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

function toDb(task: StudioTaskInput) {
  const value = studioTaskInputSchema.parse(task);
  return {
    evidence_key: value.evidenceKey, kind: value.kind, title: value.title, detail: value.detail,
    category: value.category, state: value.state, priority: value.priority, source: value.source,
    postponed_until: value.postponedUntil, completed_at: value.completedAt,
  };
}

function unavailable(): Error {
  return new Error("Today tasks are temporarily unavailable.");
}

export async function listTodayTasks(now = new Date()): Promise<StudioTask[]> {
  const client = createServiceSupabaseClient();
  const { error: reopenError } = await client.from("studio_tasks")
    .update({ state: "open", postponed_until: null, completed_at: null })
    .eq("state", "postponed")
    .lte("postponed_until", now.toISOString());
  if (reopenError) throw unavailable();
  const { data, error } = await client
    .from("studio_tasks").select(columns).order("priority", { ascending: false });
  if (error) throw unavailable();
  return (data ?? []).map((row: DbTask) => fromDb(row));
}

export type ProviderConnectionSummary = {
  provider: "google-analytics" | "google-search-console" | "google-adsense";
  state: ProviderState;
  lastCheckedAt: string | null;
};

const googleProviders = ["google-analytics", "google-search-console", "google-adsense"] as const;

export async function listProviderConnections(): Promise<ProviderConnectionSummary[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from("provider_connections").select("provider,state,last_checked_at");
  if (error) throw unavailable();
  const rows = new Map((data ?? []).map((row: { provider: string; state: string; last_checked_at: string | null }) => [row.provider, row]));
  return googleProviders.map((provider) => {
    const row = rows.get(provider);
    return { provider, state: row ? providerStateSchema.parse(row.state) : "disconnected", lastCheckedAt: row?.last_checked_at ?? null };
  });
}

export async function refreshTodayTasks(tasks: StudioTaskInput[]): Promise<StudioTask[]> {
  const parsed = tasks.map((item) => studioTaskInputSchema.parse(item));
  if (parsed.length === 0) return listTodayTasks();
  const client = createServiceSupabaseClient();
  const keys = parsed.map(({ evidenceKey }) => evidenceKey);
  const { data, error } = await client.from("studio_tasks").select("id,evidence_key,state").in("evidence_key", keys);
  if (error) throw unavailable();
  const existing = new Map((data ?? []).map((row: { id: string; evidence_key: string; state: string }) => [row.evidence_key, row]));
  const inserts: ReturnType<typeof toDb>[] = [];
  for (const item of parsed) {
    const row = existing.get(item.evidenceKey);
    if (!row) {
      inserts.push(toDb(item));
    } else if (row.state === "open") {
      const update = toDb(item);
      delete (update as Partial<typeof update>).evidence_key;
      const { error: updateError } = await client.from("studio_tasks").update(update).eq("id", row.id);
      if (updateError) throw unavailable();
    }
  }
  if (inserts.length > 0) {
    const { error: insertError } = await client.from("studio_tasks").insert(inserts);
    if (insertError) throw unavailable();
  }
  return listTodayTasks();
}

async function changeState(id: string, values: Record<string, string | null>): Promise<StudioTask> {
  const client = createServiceSupabaseClient();
  const query = client.from("studio_tasks").update(values).eq("id", id).eq("state", "open").select(columns).single();
  const { data, error } = await query;
  if (error || !data) throw unavailable();
  return fromDb(data as DbTask);
}

export function completeTask(id: string, now = new Date()): Promise<StudioTask> {
  return changeState(id, { state: "completed", completed_at: now.toISOString(), postponed_until: null });
}

export function postponeTask(id: string, postponedUntil: string): Promise<StudioTask> {
  return changeState(id, { state: "postponed", completed_at: null, postponed_until: postponedUntil });
}
