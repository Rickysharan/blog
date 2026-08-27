import path from "node:path";

import {
  fetchTrendingStories,
  writeTrendingQueue,
} from "@/lib/pipeline/fetch";
import {
  generateDrafts as generateDraftsFromQueue,
  type GenerateDraftsResult,
  type GenerateDraftsOptions,
} from "@/lib/pipeline/generate";
import type {
  FetchTrendingResult,
  FeedFetchSummary,
  QueueStory,
  QueueWriteResult,
} from "@/lib/pipeline/types";

export type PipelineMode = "github" | "vercel" | "manual";

export interface ContentPipelineResult {
  status: "completed" | "disabled";
  fetched: number;
  generated: number;
  skipped: number;
  failed: number;
  queueRemaining: number;
  activeFeeds: number;
  feedSummaries?: FeedFetchSummary[];
}

type FetchStories = () => Promise<FetchTrendingResult | QueueStory[]>;
type WriteQueue = (stories: readonly QueueStory[]) => Promise<QueueWriteResult>;
type GenerateDrafts = (
  options?: GenerateDraftsOptions,
) => Promise<GenerateDraftsResult>;

export interface RunContentPipelineOptions {
  mode?: PipelineMode;
  maxDrafts?: number;
  generationEnabled?: boolean;
  contentRoot?: string;
  env?: Record<string, string | undefined>;
  fetchStories?: FetchStories;
  writeQueue?: WriteQueue;
  generateDrafts?: GenerateDrafts;
  /** Accepted for API compatibility, deliberately never called. */
  publish?: () => Promise<unknown>;
}

function normalizeFetchResult(result: FetchTrendingResult | QueueStory[]): FetchTrendingResult {
  if (Array.isArray(result)) {
    return {
      stories: result,
      summaries: [],
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
    };
  }
  return result;
}

function generationIsEnabled(
  options: RunContentPipelineOptions,
  env: Record<string, string | undefined>,
): boolean {
  return options.generationEnabled ?? env.DRAFT_GENERATION_ENABLED?.toLocaleLowerCase() === "true";
}

export async function runContentPipeline(
  options: RunContentPipelineOptions = {},
): Promise<ContentPipelineResult> {
  const env = options.env ?? process.env;
  const mode = options.mode ?? "github";
  const contentRoot = options.contentRoot ?? path.join(process.cwd(), "content");
  const fetchStories = options.fetchStories ?? (() => fetchTrendingStories({ contentRoot }));
  const writeQueue = options.writeQueue ?? ((stories) => writeTrendingQueue(stories, { contentRoot }));
  const generateDrafts = options.generateDrafts ?? ((generateOptions) =>
    generateDraftsFromQueue({
      ...generateOptions,
      env,
      contentRoot,
    }));

  const fetchedResult = normalizeFetchResult(await fetchStories());
  if (fetchedResult.summaries.length > 0 && fetchedResult.successCount === 0) {
    throw new Error("No active RSS source succeeded; the existing queue was left unchanged");
  }
  const written = await writeQueue(fetchedResult.stories);
  const feedSummaries = fetchedResult.summaries;
  const activeFeeds = feedSummaries.filter(({ status }) => status === "success").length;

  if (!generationIsEnabled(options, env)) {
    return {
      status: "disabled",
      fetched: fetchedResult.stories.length,
      generated: 0,
      skipped: 0,
      failed: 0,
      queueRemaining: written.written,
      activeFeeds,
      feedSummaries,
    };
  }

  const maxDrafts = options.maxDrafts ?? (mode === "vercel" ? 3 : undefined);
  const generation = await generateDrafts({ maxDrafts });
  return {
    status: generation.status,
    fetched: fetchedResult.stories.length,
    generated: generation.created.length,
    skipped: generation.skipped.length,
    failed: generation.failed.length,
    queueRemaining: generation.remaining ?? generation.failed.length,
    activeFeeds,
    feedSummaries,
  };
}
