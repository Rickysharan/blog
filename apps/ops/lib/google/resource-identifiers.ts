import type { GoogleProvider } from "./connections";

export function validSearchConsoleSite(value: string): boolean {
  if (/^sc-domain:[a-z0-9.-]+$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function storedGoogleResourceId(provider: GoogleProvider, label: string | null): string | null {
  if (!label) return null;
  if (provider === "google-analytics") {
    const match = label.match(/(?:^| · )(\d+)$/);
    return match?.[1] ?? null;
  }
  if (provider === "google-search-console") return validSearchConsoleSite(label) ? label : null;
  return /^pub-\d{16}$/.test(label) ? label : null;
}

export function analyticsPropertyLabel(displayName: string, propertyId: string): string {
  const safeName = displayName.trim().slice(0, 200) || "Google Analytics";
  return `${safeName} · ${propertyId}`;
}
