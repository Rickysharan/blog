import {
  bcp47LanguageSchema,
  regionSchema,
  type Region,
} from "@omnilede/contracts";
import { z } from "zod";

import type { ArticleSummary } from "@/lib/content/schema";

export const REGION_PREFERENCE_KEY = "omnilede-region-preference";

export const REGION_LABELS: Record<Region, string> = {
  global: "Global",
  africa: "Africa",
  asia: "Asia",
  europe: "Europe",
  "middle-east": "Middle East",
  "north-america": "North America",
  "latin-america": "Latin America",
  oceania: "Oceania",
};

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
  { value: "ar", label: "Arabic" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "ja", label: "Japanese" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
] as const;

const explicitPreferenceSchema = z
  .object({
    region: regionSchema.exclude(["global"]),
    language: bcp47LanguageSchema,
  })
  .strict();

export const regionContextSchema = z
  .object({
    countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
    region: regionSchema,
    source: z.enum(["netlify", "fallback"]),
  })
  .strict();

export type ExplicitRegionPreference = z.infer<typeof explicitPreferenceSchema>;
export type RegionContext = z.infer<typeof regionContextSchema>;
export type RegionSelection =
  | { mode: "global"; region: "global"; language: null }
  | { mode: "suggested"; region: Exclude<Region, "global">; language: null }
  | { mode: "choice"; region: Exclude<Region, "global">; language: string };

export const GLOBAL_SELECTION: RegionSelection = {
  mode: "global",
  region: "global",
  language: null,
};

export function readExplicitPreference(storage: Pick<Storage, "getItem" | "removeItem">): ExplicitRegionPreference | null {
  const stored = storage.getItem(REGION_PREFERENCE_KEY);
  if (!stored) return null;

  try {
    const parsed = explicitPreferenceSchema.safeParse(JSON.parse(stored));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid browser state is discarded below.
  }

  storage.removeItem(REGION_PREFERENCE_KEY);
  return null;
}

export function saveExplicitPreference(
  storage: Pick<Storage, "setItem">,
  preference: ExplicitRegionPreference,
): void {
  const parsed = explicitPreferenceSchema.parse(preference);
  storage.setItem(REGION_PREFERENCE_KEY, JSON.stringify(parsed));
}

export function clearExplicitPreference(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(REGION_PREFERENCE_KEY);
}

export function resolveRegionSelection(
  explicit: ExplicitRegionPreference | null,
  context: RegionContext | null,
): RegionSelection {
  if (explicit) {
    return { mode: "choice", ...explicit };
  }
  if (context?.source === "netlify" && context.region !== "global") {
    return { mode: "suggested", region: context.region, language: null };
  }
  return GLOBAL_SELECTION;
}

export function formatRegionSelection(selection: RegionSelection): string {
  if (selection.mode === "global") return "Showing: Global";
  const region = REGION_LABELS[selection.region];
  if (selection.mode === "suggested") return `Showing: Suggested — ${region}`;
  return `Showing: Your choice — ${region} · ${selection.language}`;
}

export function orderArticlesForSelection(
  articles: readonly ArticleSummary[],
  selection: RegionSelection,
): ArticleSummary[] {
  if (selection.mode === "global") return [...articles];

  const rank = (article: ArticleSummary): number => {
    const articleRegion = article.region ?? "global";
    if (
      selection.mode === "choice" &&
      articleRegion === selection.region &&
      article.language === selection.language
    ) {
      return 0;
    }
    if (articleRegion === selection.region) return selection.mode === "choice" ? 1 : 0;
    if (articleRegion === "global") return selection.mode === "choice" ? 2 : 1;
    return selection.mode === "choice" ? 3 : 2;
  };

  return articles
    .map((article, index) => ({ article, index, rank: rank(article) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ article }) => article);
}
