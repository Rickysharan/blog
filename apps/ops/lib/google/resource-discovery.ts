import "server-only";

import { parseGoogleProviderEnv } from "../env";
import { createGoogleHttpClient } from "../providers/google-http";
import { createServiceSupabaseClient } from "../supabase/server";
import { GOOGLE_PROVIDERS, readGoogleRefreshToken, type GoogleProvider } from "./connections";
import { analyticsPropertyLabel, validSearchConsoleSite } from "./resource-identifiers";

type ResourceMetadata = { accountLabel: string; propertyLabel: string };
export type GoogleResourceDiscoveryResult = {
  provider: GoogleProvider;
  status: "selected" | "empty" | "unavailable";
  resourceId: string | null;
};

type Dependencies = {
  blogOrigin: string;
  request(provider: GoogleProvider, url: string): Promise<unknown>;
  save(provider: GoogleProvider, metadata: ResourceMetadata | null, checkedAt: string): Promise<void>;
  now?: () => Date;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function entries(value: unknown, field: string): Record<string, unknown>[] {
  const items = object(value)?.[field];
  if (items === undefined) return [];
  if (!Array.isArray(items) || items.length > 500) throw new Error("Invalid Google resource response");
  return items.map((item) => {
    const row = object(item);
    if (!row) throw new Error("Invalid Google resource response");
    return row;
  });
}

function text(row: Record<string, unknown>, field: string, max = 240): string | null {
  const value = row[field];
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function analytics(value: unknown) {
  const choices = entries(value, "accountSummaries").flatMap((account) => {
    const accountName = text(account, "displayName", 160) ?? "Google Analytics";
    const properties = account.propertySummaries === undefined ? [] : entries({ rows: account.propertySummaries }, "rows");
    return properties.flatMap((property) => {
      const name = text(property, "property");
      const match = name?.match(/^properties\/(\d+)$/);
      if (!match) return [];
      const displayName = text(property, "displayName", 200) ?? "Google Analytics";
      return [{ accountName, displayName, id: match[1]! }];
    });
  });
  return choices.find(({ displayName }) => /omni\s*lede/i.test(displayName)) ?? choices[0] ?? null;
}

function searchConsole(value: unknown, blogOrigin: string) {
  const choices = entries(value, "siteEntry").flatMap((site) => {
    const siteUrl = text(site, "siteUrl");
    return siteUrl && validSearchConsoleSite(siteUrl) ? [{ siteUrl }] : [];
  });
  const exact = new Set([blogOrigin, `${blogOrigin}/`]);
  return choices.find(({ siteUrl }) => exact.has(siteUrl))
    ?? choices.find(({ siteUrl }) => siteUrl === `sc-domain:${new URL(blogOrigin).hostname}`)
    ?? choices[0]
    ?? null;
}

function adsense(value: unknown) {
  return entries(value, "accounts").flatMap((account) => {
    const name = text(account, "name");
    const match = name?.match(/^accounts\/(pub-\d{16})$/);
    if (!match) return [];
    return [{ id: match[1]!, displayName: text(account, "displayName", 160) ?? "Google AdSense" }];
  })[0] ?? null;
}

const emptyMetadata: Record<GoogleProvider, ResourceMetadata> = {
  "google-analytics": { accountLabel: "Google account connected", propertyLabel: "GA4 property not found" },
  "google-search-console": { accountLabel: "Google account connected", propertyLabel: "Search Console site not found" },
  "google-adsense": { accountLabel: "Google account connected", propertyLabel: "AdSense account not found" }
};

export function createGoogleResourceDiscovery(dependencies: Dependencies) {
  return async function discover(): Promise<GoogleResourceDiscoveryResult[]> {
    const checkedAt = (dependencies.now?.() ?? new Date()).toISOString();
    return Promise.all(GOOGLE_PROVIDERS.map(async (provider): Promise<GoogleResourceDiscoveryResult> => {
      try {
        const url = provider === "google-analytics"
          ? "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200"
          : provider === "google-search-console"
            ? "https://www.googleapis.com/webmasters/v3/sites"
            : "https://adsense.googleapis.com/v2/accounts?pageSize=100";
        const response = await dependencies.request(provider, url);
        if (provider === "google-analytics") {
          const selected = analytics(response);
          if (!selected) {
            await dependencies.save(provider, emptyMetadata[provider], checkedAt);
            return { provider, status: "empty", resourceId: null };
          }
          await dependencies.save(provider, { accountLabel: selected.accountName, propertyLabel: analyticsPropertyLabel(selected.displayName, selected.id) }, checkedAt);
          return { provider, status: "selected", resourceId: selected.id };
        }
        if (provider === "google-search-console") {
          const selected = searchConsole(response, dependencies.blogOrigin);
          if (!selected) {
            await dependencies.save(provider, emptyMetadata[provider], checkedAt);
            return { provider, status: "empty", resourceId: null };
          }
          await dependencies.save(provider, { accountLabel: "Google Search Console", propertyLabel: selected.siteUrl }, checkedAt);
          return { provider, status: "selected", resourceId: selected.siteUrl };
        }
        const selected = adsense(response);
        if (!selected) {
          await dependencies.save(provider, emptyMetadata[provider], checkedAt);
          return { provider, status: "empty", resourceId: null };
        }
        await dependencies.save(provider, { accountLabel: selected.displayName, propertyLabel: selected.id }, checkedAt);
        return { provider, status: "selected", resourceId: selected.id };
      } catch {
        await dependencies.save(provider, null, checkedAt);
        return { provider, status: "unavailable", resourceId: null };
      }
    }));
  };
}

async function saveResource(provider: GoogleProvider, metadata: ResourceMetadata | null, checkedAt: string) {
  const values = metadata
    ? { account_label: metadata.accountLabel, property_label: metadata.propertyLabel, last_checked_at: checkedAt }
    : { last_checked_at: checkedAt };
  const { data, error } = await createServiceSupabaseClient().from("provider_connections")
    .update(values).eq("provider", provider).select("provider").maybeSingle();
  if (error || !data) throw new Error("Google resource status could not be saved");
}

export async function refreshGoogleResources(): Promise<GoogleResourceDiscoveryResult[]> {
  const config = parseGoogleProviderEnv();
  const clients = new Map<GoogleProvider, ReturnType<typeof createGoogleHttpClient>>();
  for (const provider of GOOGLE_PROVIDERS) {
    clients.set(provider, createGoogleHttpClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      readRefreshToken: () => readGoogleRefreshToken(provider, config.encryptionKey)
    }));
  }
  return createGoogleResourceDiscovery({
    blogOrigin: config.blogOrigin,
    request: (provider, url) => clients.get(provider)!(url),
    save: saveResource
  })();
}
