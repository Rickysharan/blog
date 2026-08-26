import { promises as fs } from "node:fs";
import path from "node:path";

import matter from "gray-matter";
import Parser from "rss-parser";

import { FEEDS } from "@/lib/pipeline/feeds";
import {
  canonicalizeSourceUrl,
  dedupeStories,
  normalizeTitle,
} from "@/lib/pipeline/dedupe";
import type {
  FeedDefinition,
  FeedFetchSummary,
  FetchLike,
  FetchTrendingResult,
  QueueStory,
  QueueWriteResult,
} from "@/lib/pipeline/types";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS_PER_FEED = 25;
const MAX_STORY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "OmniLedeFeedFetcher/1.0 (+https://github.com/omnilede/omnilede; RSS discovery only)";

interface FetchTrendingOptions {
  feeds?: readonly FeedDefinition[];
  fetchImpl?: FetchLike;
  now?: Date;
  contentRoot?: string;
}

interface QueueWriteOptions {
  contentRoot?: string;
}

interface FeedResult {
  stories: QueueStory[];
  summary: FeedFetchSummary;
}

interface ExistingContent {
  sourceUrls: Set<string>;
  titles: Set<string>;
  slugs: Set<string>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
    lt: "<",
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code.toLocaleLowerCase()] ?? entity;
  });
}

function plainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function boundedSnippet(value: string): string {
  const clean = plainText(value);
  if (clean.length <= 600) {
    return clean;
  }
  return `${clean.slice(0, 597).trimEnd()}…`;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    throw new Error("Feed response exceeds the 2 MiB safety limit");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > MAX_FEED_BYTES) {
        await reader.cancel("Feed response exceeds the 2 MiB safety limit");
        throw new Error("Feed response exceeds the 2 MiB safety limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseDate(value: string | undefined, now: Date): Date {
  if (!value) {
    return now;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? now : date;
}

function isRecent(date: Date, now: Date): boolean {
  const age = now.getTime() - date.getTime();
  return age <= MAX_STORY_AGE_MS && age >= -24 * 60 * 60 * 1000;
}

async function fetchFeed(
  feed: FeedDefinition,
  fetchImpl: FetchLike,
  now: Date,
): Promise<FeedResult> {
  const response = await fetchImpl(feed.url, {
    headers: {
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
      "user-agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const xml = await readBoundedBody(response);
  if (!/^\s*(?:<\?xml\b[^>]*>\s*)?<(?:rss|feed|rdf:RDF)\b/i.test(xml)) {
    throw new Error("Response is not an RSS or Atom document");
  }

  const parsed = await new Parser().parseString(xml);
  const stories: QueueStory[] = [];

  for (const item of parsed.items.slice(0, MAX_ITEMS_PER_FEED)) {
    const title = plainText(item.title ?? "");
    const date = parseDate(item.isoDate ?? item.pubDate, now);
    if (!title || !item.link || !isRecent(date, now)) {
      continue;
    }

    let sourceUrl: string;
    try {
      sourceUrl = canonicalizeSourceUrl(item.link);
    } catch {
      continue;
    }

    const snippet = boundedSnippet(
      item.content ?? item.summary ?? item.contentSnippet ?? title,
    );
    if (!snippet) {
      continue;
    }

    stories.push({
      title,
      source: feed.source,
      sourceUrl,
      date: date.toISOString(),
      snippet,
      category: feed.category,
    });
  }

  return {
    stories,
    summary: {
      id: feed.id,
      source: feed.source,
      status: "success",
      itemCount: stories.length,
    },
  };
}

function skippedFeed(feed: FeedDefinition): FeedResult {
  return {
    stories: [],
    summary: {
      id: feed.id,
      source: feed.source,
      status: "skipped",
      itemCount: 0,
      error: feed.unavailableReason ?? "Feed is unavailable",
    },
  };
}

function failedFeed(feed: FeedDefinition, error: unknown): FeedResult {
  return {
    stories: [],
    summary: {
      id: feed.id,
      source: feed.source,
      status: "failed",
      itemCount: 0,
      error: errorMessage(error),
    },
  };
}

function sortStories(stories: readonly QueueStory[]): QueueStory[] {
  return [...stories].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      left.category.localeCompare(right.category) ||
      normalizeTitle(left.title).localeCompare(normalizeTitle(right.title)),
  );
}

function slugifyTitle(value: string): string {
  return normalizeTitle(value).replace(/\s+/g, "-").slice(0, 120);
}

async function mdxFiles(directory: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return mdxFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".mdx") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

async function readExistingContent(contentRoot: string): Promise<ExistingContent> {
  const files = (
    await Promise.all([
      mdxFiles(path.join(contentRoot, "articles")),
      mdxFiles(path.join(contentRoot, "drafts")),
    ])
  ).flat();
  const existing: ExistingContent = {
    sourceUrls: new Set(),
    titles: new Set(),
    slugs: new Set(),
  };

  await Promise.all(
    files.map(async (filePath) => {
      const { data } = matter(await fs.readFile(filePath, "utf8"));
      if (typeof data.sourceUrl === "string") {
        try {
          existing.sourceUrls.add(canonicalizeSourceUrl(data.sourceUrl));
        } catch {
          // Invalid drafts are reported by content validation; they do not stop discovery.
        }
      }
      if (typeof data.title === "string") {
        existing.titles.add(normalizeTitle(data.title));
      }
      if (typeof data.slug === "string") {
        existing.slugs.add(data.slug);
      }
    }),
  );

  return existing;
}

function isExisting(story: QueueStory, existing: ExistingContent): boolean {
  return (
    existing.sourceUrls.has(canonicalizeSourceUrl(story.sourceUrl)) ||
    existing.titles.has(normalizeTitle(story.title)) ||
    existing.slugs.has(slugifyTitle(story.title))
  );
}

async function filterExistingStories(
  stories: readonly QueueStory[],
  contentRoot: string,
): Promise<{ stories: QueueStory[]; skippedExisting: number }> {
  const existing = await readExistingContent(contentRoot);
  const fresh = stories.filter((story) => !isExisting(story, existing));
  return { stories: fresh, skippedExisting: stories.length - fresh.length };
}

export async function fetchTrendingStories(
  options: FetchTrendingOptions = {},
): Promise<FetchTrendingResult> {
  const feeds = options.feeds ?? FEEDS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  const settled = await Promise.allSettled(
    feeds.map((feed) =>
      feed.status === "unavailable"
        ? Promise.resolve(skippedFeed(feed))
        : fetchFeed(feed, fetchImpl, now),
    ),
  );

  const results = settled.map((result, index) => {
    const feed = feeds[index];
    if (!feed) {
      throw new Error("Feed result did not match a feed definition");
    }
    return result.status === "fulfilled"
      ? result.value
      : failedFeed(feed, result.reason);
  });

  let stories = sortStories(dedupeStories(results.flatMap((result) => result.stories)));
  if (options.contentRoot) {
    stories = (await filterExistingStories(stories, options.contentRoot)).stories;
  }

  const summaries = results.map(({ summary }) => summary);
  return {
    stories,
    summaries,
    successCount: summaries.filter(({ status }) => status === "success").length,
    failureCount: summaries.filter(({ status }) => status === "failed").length,
    skippedCount: summaries.filter(({ status }) => status === "skipped").length,
  };
}

export async function writeTrendingQueue(
  stories: readonly QueueStory[],
  options: QueueWriteOptions = {},
): Promise<QueueWriteResult> {
  const contentRoot = options.contentRoot ?? path.join(process.cwd(), "content");
  const queueDirectory = path.join(contentRoot, "queue");
  const queuePath = path.join(queueDirectory, "trending.json");
  const filtered = await filterExistingStories(dedupeStories(stories), contentRoot);
  const sorted = sortStories(filtered.stories);

  await fs.mkdir(queueDirectory, { recursive: true });
  const temporaryPath = path.join(
    queueDirectory,
    `.trending-${process.pid}-${Date.now()}.json`,
  );
  await fs.writeFile(temporaryPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, queuePath);

  return {
    queuePath,
    stories: sorted,
    written: sorted.length,
    skippedExisting: filtered.skippedExisting,
  };
}
