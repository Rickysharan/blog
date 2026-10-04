import "server-only";

import { openToken, sealToken, type SealedToken } from "../crypto/token-vault";
import { createServiceSupabaseClient } from "../supabase/server";
import type { GoogleCredentials } from "./oauth";

export const GOOGLE_PROVIDERS = ["google-analytics", "google-search-console", "google-adsense"] as const;
export type GoogleProvider = (typeof GOOGLE_PROVIDERS)[number];

export type SafeGoogleConnection = {
  provider: GoogleProvider;
  state: "connected" | "delayed" | "stale" | "unavailable" | "disconnected";
  accountLabel: string | null;
  propertyLabel: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  scopes: string[];
  reconnectRequired: boolean;
};

const propertyLabels: Record<GoogleProvider, string> = {
  "google-analytics": "GA4 property not selected",
  "google-search-console": "Search Console site not selected",
  "google-adsense": "AdSense site not selected"
};

function bytea(value: string): string {
  return `\\x${Buffer.from(value, "base64").toString("hex")}`;
}

function fromBytea(value: string): string {
  if (!value.startsWith("\\x")) throw new Error("Protected Google credential is invalid");
  return Buffer.from(value.slice(2), "hex").toString("base64");
}

export async function persistGoogleCredentials(credentials: GoogleCredentials, encryptionKey: string): Promise<void> {
  const client = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const connectionRows = GOOGLE_PROVIDERS.map((provider) => ({
    provider,
    state: "connected",
    account_label: "Google account connected",
    property_label: propertyLabels[provider],
    connected_at: now,
    last_checked_at: now
  }));
  const { error: connectionError } = await client.from("provider_connections").upsert(connectionRows);
  if (connectionError) throw new Error("Google connection could not be saved");

  const credentialRows = GOOGLE_PROVIDERS.map((provider) => {
    const sealed = sealToken(JSON.stringify({ refreshToken: credentials.refreshToken }), encryptionKey);
    return {
      provider,
      ciphertext: bytea(sealed.ciphertext),
      iv: bytea(sealed.iv),
      authentication_tag: bytea(sealed.authenticationTag),
      scopes: credentials.scopes,
      token_expires_at: null
    };
  });
  const { error: credentialError } = await client.schema("app_private").from("provider_credentials").upsert(credentialRows);
  if (credentialError) {
    await client.from("provider_connections").update({ state: "unavailable", last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]);
    throw new Error("Google connection could not be saved");
  }
}

export async function listGoogleConnections(): Promise<SafeGoogleConnection[]> {
  const client = createServiceSupabaseClient();
  const [{ data: connections, error: connectionError }, { data: credentials, error: credentialError }] = await Promise.all([
    client.from("provider_connections").select("provider,state,account_label,property_label,connected_at,last_checked_at").in("provider", [...GOOGLE_PROVIDERS]),
    client.schema("app_private").from("provider_credentials").select("provider,scopes").in("provider", [...GOOGLE_PROVIDERS])
  ]);
  if (connectionError || credentialError) throw new Error("Google connections are temporarily unavailable");
  const rows = new Map((connections ?? []).map((row: Record<string, unknown>) => [row.provider, row]));
  const scopeRows = new Map((credentials ?? []).map((row: Record<string, unknown>) => [row.provider, row.scopes]));
  return GOOGLE_PROVIDERS.map((provider) => {
    const row = rows.get(provider);
    const scopes = scopeRows.get(provider);
    const state = (row?.state as SafeGoogleConnection["state"] | undefined) ?? "disconnected";
    return {
      provider,
      state,
      accountLabel: (row?.account_label as string | null | undefined) ?? null,
      propertyLabel: (row?.property_label as string | null | undefined) ?? null,
      connectedAt: (row?.connected_at as string | null | undefined) ?? null,
      lastCheckedAt: (row?.last_checked_at as string | null | undefined) ?? null,
      scopes: Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === "string") : [],
      reconnectRequired: state === "unavailable" && Array.isArray(scopes)
    };
  });
}

export async function revokeGoogleCredentials(encryptionKey: string, fetcher: typeof fetch = fetch): Promise<"disconnected" | "reconnect-required"> {
  const client = createServiceSupabaseClient();
  const { data, error } = await client.schema("app_private").from("provider_credentials")
    .select("ciphertext,iv,authentication_tag").in("provider", [...GOOGLE_PROVIDERS]).limit(1).maybeSingle();
  if (error) throw new Error("Google connection could not be revoked");
  if (!data) {
    await client.from("provider_connections").update({ state: "disconnected", last_checked_at: new Date().toISOString() }).in("provider", [...GOOGLE_PROVIDERS]);
    return "disconnected";
  }
  let refreshToken: string;
  try {
    const sealed: SealedToken = { version: 1, ciphertext: fromBytea(data.ciphertext), iv: fromBytea(data.iv), authenticationTag: fromBytea(data.authentication_tag) };
    const parsed = JSON.parse(openToken(sealed, encryptionKey)) as { refreshToken?: unknown };
    if (typeof parsed.refreshToken !== "string" || !parsed.refreshToken) throw new Error("invalid");
    refreshToken = parsed.refreshToken;
  } catch {
    await client.from("provider_connections").update({ state: "unavailable", last_checked_at: new Date().toISOString() }).in("provider", [...GOOGLE_PROVIDERS]);
    return "reconnect-required";
  }

  let revoked = false;
  try {
    const response = await fetcher("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ token: refreshToken }),
      cache: "no-store"
    });
    revoked = response.ok;
  } catch {
    revoked = false;
  }
  const now = new Date().toISOString();
  if (!revoked) {
    await client.from("provider_connections").update({ state: "unavailable", last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]);
    return "reconnect-required";
  }
  const { error: deleteError } = await client.schema("app_private").from("provider_credentials").delete().in("provider", [...GOOGLE_PROVIDERS]);
  if (deleteError) {
    await client.from("provider_connections").update({ state: "unavailable", last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]);
    return "reconnect-required";
  }
  await client.from("provider_connections").update({ state: "disconnected", last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]);
  return "disconnected";
}
