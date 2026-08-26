import type { QueueStory } from "@/lib/pipeline/types";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

const OUTLET_SUFFIX =
  /\s+(?:-|–|—|\|)\s+(?:anime news network|crunchyroll news|variety|ign(?: movies)?|reuters|al jazeera|ap news|bbc sport|espn|yahoo finance|moneycontrol|cnbc(?: markets)?)\s*$/i;

const SIMILARITY_THRESHOLD = 0.72;
const SIMILARITY_WINDOW_MS = 72 * 60 * 60 * 1000;

function normalizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 5 && token.endsWith("ing")) {
    return token.slice(0, -3).replace(/(.)\1$/, "$1");
  }
  if (token.length > 4 && token.endsWith("ed")) {
    return token.slice(0, -2).replace(/(.)\1$/, "$1");
  }
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

export function canonicalizeSourceUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Source URL must be an absolute HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Source URL must use HTTPS");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLocaleLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLocaleLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.hostname = url.hostname.toLocaleLowerCase();

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString().replace(/\/$/, "");
}

export function normalizeTitle(value: string): string {
  const withoutOutlet = value.replace(OUTLET_SUFFIX, "");
  return withoutOutlet
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .map(normalizeToken)
    .join(" ");
}

function tokens(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(" ").filter(Boolean));
}

function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function withinSimilarityWindow(left: QueueStory, right: QueueStory): boolean {
  const leftTime = Date.parse(left.date);
  const rightTime = Date.parse(right.date);
  return (
    Number.isFinite(leftTime) &&
    Number.isFinite(rightTime) &&
    Math.abs(leftTime - rightTime) <= SIMILARITY_WINDOW_MS
  );
}

function isDuplicate(left: QueueStory, right: QueueStory): boolean {
  if (left.category !== right.category) {
    return false;
  }

  if (canonicalizeSourceUrl(left.sourceUrl) === canonicalizeSourceUrl(right.sourceUrl)) {
    return true;
  }

  return (
    withinSimilarityWindow(left, right) &&
    jaccardSimilarity(left.title, right.title) >= SIMILARITY_THRESHOLD
  );
}

function mergeStories(existing: QueueStory, candidate: QueueStory): QueueStory {
  const newer = candidate.date > existing.date ? candidate : existing;
  const richerSnippet =
    candidate.snippet.length > existing.snippet.length
      ? candidate.snippet
      : existing.snippet;

  return { ...newer, snippet: richerSnippet };
}

export function dedupeStories(stories: readonly QueueStory[]): QueueStory[] {
  const deduplicated: QueueStory[] = [];

  for (const story of stories) {
    const matchIndex = deduplicated.findIndex((candidate) =>
      isDuplicate(candidate, story),
    );
    if (matchIndex === -1) {
      deduplicated.push({ ...story });
      continue;
    }

    const existing = deduplicated[matchIndex];
    if (existing) {
      deduplicated[matchIndex] = mergeStories(existing, story);
    }
  }

  return deduplicated;
}
