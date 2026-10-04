import "server-only";

import { openToken, sealToken, type CanonicalBase64, type SealedToken } from "../crypto/token-vault";
import { createServiceSupabaseClient } from "../supabase/server";
import type { GoogleCredentials } from "./oauth";

export const GOOGLE_PROVIDERS = ["google-analytics", "google-search-console", "google-adsense"] as const;
export type GoogleProvider = (typeof GOOGLE_PROVIDERS)[number];

type ProviderState = "connected" | "delayed" | "stale" | "unavailable" | "disconnected";
type ConnectionRow = {
  provider: GoogleProvider;
  state: ProviderState;
  account_label: string | null;
  property_label: string | null;
  connected_at: string | null;
  last_checked_at: string | null;
};
type CredentialSummary = { provider: GoogleProvider; scopes: string[] };
type StoredCredential = { ciphertext: string; iv: string; authentication_tag: string };

export async function readGoogleRefreshToken(
  provider: GoogleProvider,
  encryptionKey: string,
): Promise<string> {
  const { data, error } = await createServiceSupabaseClient().schema("app_private").from("provider_credentials")
    .select("ciphertext,iv,authentication_tag").eq("provider", provider).maybeSingle();
  if (error || !data) throw new Error("Google connection requires reconnection");
  try {
    const sealed: SealedToken = {
      version: 1,
      ciphertext: fromBytea(data.ciphertext),
      iv: fromBytea(data.iv),
      authenticationTag: fromBytea(data.authentication_tag),
    };
    const parsed: unknown = JSON.parse(openToken(sealed, encryptionKey));
    if (!parsed || typeof parsed !== "object" || !("refreshToken" in parsed) || typeof parsed.refreshToken !== "string" || !parsed.refreshToken) {
      throw new Error("invalid");
    }
    return parsed.refreshToken;
  } catch {
    throw new Error("Google connection requires reconnection");
  }
}

export type GoogleConnectionStore = {
  stageSetup(now: string): Promise<void>;
  saveCredentials(rows: Array<StoredCredential & { provider: GoogleProvider; scopes: string[] }>): Promise<void>;
  markConnected(now: string): Promise<void>;
  markUnavailable(now: string): Promise<void>;
  readCredential(): Promise<StoredCredential | null>;
  deleteCredentials(): Promise<void>;
  markDisconnected(now: string): Promise<void>;
  listConnections(): Promise<ConnectionRow[]>;
  listCredentials(): Promise<CredentialSummary[]>;
};

export type SafeGoogleConnection = {
  provider: GoogleProvider;
  state: ProviderState;
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

function bytea(value: CanonicalBase64): string {
  return `\\x${Buffer.from(value, "base64").toString("hex")}`;
}

function fromBytea(value: string): CanonicalBase64 {
  if (!/^\\x(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Protected Google credential is invalid");
  return Buffer.from(value.slice(2), "hex").toString("base64") as CanonicalBase64;
}

function checkedRows(data: unknown, error: unknown, action: string): void {
  if (error || !Array.isArray(data) || data.length !== GOOGLE_PROVIDERS.length) throw new Error(action);
}

const databaseStore: GoogleConnectionStore = {
  async stageSetup(now) {
    const rows = GOOGLE_PROVIDERS.map((provider) => ({
      provider, state: "unavailable", account_label: "Google account connected",
      property_label: propertyLabels[provider], connected_at: null, last_checked_at: now
    }));
    const { data, error } = await createServiceSupabaseClient().from("provider_connections").upsert(rows).select("provider");
    checkedRows(data, error, "Google connection staging failed");
  },
  async saveCredentials(rows) {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").from("provider_credentials")
      .upsert(rows.map((row) => ({ ...row, token_expires_at: null }))).select("provider");
    checkedRows(data, error, "Google credential storage failed");
  },
  async markConnected(now) {
    const { data, error } = await createServiceSupabaseClient().from("provider_connections")
      .update({ state: "connected", connected_at: now, last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]).select("provider");
    checkedRows(data, error, "Google connection activation failed");
  },
  async markUnavailable(now) {
    const { data, error } = await createServiceSupabaseClient().from("provider_connections")
      .update({ state: "unavailable", last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]).select("provider");
    checkedRows(data, error, "Google reconnect state could not be saved");
  },
  async readCredential() {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").from("provider_credentials")
      .select("ciphertext,iv,authentication_tag").in("provider", [...GOOGLE_PROVIDERS]).limit(1).maybeSingle();
    if (error) throw new Error("Google credential could not be read");
    return data as StoredCredential | null;
  },
  async deleteCredentials() {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").from("provider_credentials")
      .delete().in("provider", [...GOOGLE_PROVIDERS]).select("provider");
    checkedRows(data, error, "Google credential deletion failed");
  },
  async markDisconnected(now) {
    const { data, error } = await createServiceSupabaseClient().from("provider_connections")
      .update({ state: "disconnected", last_checked_at: now }).in("provider", [...GOOGLE_PROVIDERS]).select("provider");
    checkedRows(data, error, "Google disconnect state could not be saved");
  },
  async listConnections() {
    const { data, error } = await createServiceSupabaseClient().from("provider_connections")
      .select("provider,state,account_label,property_label,connected_at,last_checked_at").in("provider", [...GOOGLE_PROVIDERS]);
    if (error) throw new Error("Google connections could not be read");
    return (data ?? []) as ConnectionRow[];
  },
  async listCredentials() {
    const { data, error } = await createServiceSupabaseClient().schema("app_private").from("provider_credentials")
      .select("provider,scopes").in("provider", [...GOOGLE_PROVIDERS]);
    if (error) throw new Error("Google credential summaries could not be read");
    return (data ?? []) as CredentialSummary[];
  }
};

export function createGoogleConnectionService(store: GoogleConnectionStore) {
  return {
    async persist(credentials: GoogleCredentials, encryptionKey: string): Promise<void> {
      const now = new Date().toISOString();
      let staged = false;
      try {
        await store.stageSetup(now);
        staged = true;
        const rows = GOOGLE_PROVIDERS.map((provider) => {
          const sealed = sealToken(JSON.stringify({ refreshToken: credentials.refreshToken }), encryptionKey);
          return { provider, ciphertext: bytea(sealed.ciphertext), iv: bytea(sealed.iv), authentication_tag: bytea(sealed.authenticationTag), scopes: credentials.scopes };
        });
        await store.saveCredentials(rows);
        await store.markConnected(now);
      } catch {
        if (staged) {
          try { await store.markUnavailable(now); } catch { /* Initial staging already established fail-closed state. */ }
        }
        throw new Error("Google connection could not be saved");
      }
    },

    async list(): Promise<SafeGoogleConnection[]> {
      let connections: ConnectionRow[];
      let credentials: CredentialSummary[];
      try {
        [connections, credentials] = await Promise.all([store.listConnections(), store.listCredentials()]);
      } catch {
        throw new Error("Google connections are temporarily unavailable");
      }
      const rows = new Map(connections.map((row) => [row.provider, row]));
      const credentialRows = new Map(credentials.map((row) => [row.provider, row]));
      return GOOGLE_PROVIDERS.map((provider) => {
        const row = rows.get(provider);
        const credential = credentialRows.get(provider);
        const storedState = row?.state ?? "disconnected";
        const missingCredential = storedState !== "disconnected" && !credential;
        const state: ProviderState = missingCredential ? "unavailable" : storedState;
        return {
          provider, state,
          accountLabel: row?.account_label ?? null,
          propertyLabel: row?.property_label ?? null,
          connectedAt: row?.connected_at ?? null,
          lastCheckedAt: row?.last_checked_at ?? null,
          scopes: credential?.scopes.filter((scope): scope is string => typeof scope === "string") ?? [],
          reconnectRequired: state === "unavailable"
        };
      });
    },

    async revoke(encryptionKey: string, fetcher: typeof fetch = fetch): Promise<"disconnected" | "reconnect-required"> {
      const now = new Date().toISOString();
      let data: StoredCredential | null;
      try {
        await store.markUnavailable(now);
        data = await store.readCredential();
      } catch {
        throw new Error("Google connection could not be revoked");
      }
      if (!data) {
        try { await store.markDisconnected(now); } catch { throw new Error("Google connection could not be revoked"); }
        return "disconnected";
      }

      let refreshToken: string;
      try {
        const sealed: SealedToken = { version: 1, ciphertext: fromBytea(data.ciphertext), iv: fromBytea(data.iv), authenticationTag: fromBytea(data.authentication_tag) };
        const parsed = JSON.parse(openToken(sealed, encryptionKey)) as { refreshToken?: unknown };
        if (typeof parsed.refreshToken !== "string" || !parsed.refreshToken) throw new Error("invalid");
        refreshToken = parsed.refreshToken;
      } catch {
        return "reconnect-required";
      }

      try {
        const response = await fetcher("https://oauth2.googleapis.com/revoke", {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: new URLSearchParams({ token: refreshToken }), cache: "no-store"
        });
        if (!response.ok) return "reconnect-required";
      } catch {
        return "reconnect-required";
      }
      try {
        await store.deleteCredentials();
        await store.markDisconnected(now);
      } catch {
        throw new Error("Google connection could not be revoked");
      }
      return "disconnected";
    }
  };
}

const service = createGoogleConnectionService(databaseStore);
export const persistGoogleCredentials = service.persist;
export const listGoogleConnections = service.list;
export const revokeGoogleCredentials = service.revoke;
