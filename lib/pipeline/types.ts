import type { CategorySlug } from "@/lib/config/categories";

export type FeedStatus = "active" | "unavailable";

export interface FeedDefinition {
  id: string;
  source: string;
  category: CategorySlug;
  url: string;
  status: FeedStatus;
  unavailableReason?: string;
}

export interface QueueStory {
  title: string;
  source: string;
  sourceUrl: string;
  date: string;
  snippet: string;
  category: CategorySlug;
}

export type FeedFetchStatus = "success" | "failed" | "skipped";

export interface FeedFetchSummary {
  id: string;
  source: string;
  status: FeedFetchStatus;
  itemCount: number;
  error?: string;
}

export interface FetchTrendingResult {
  stories: QueueStory[];
  summaries: FeedFetchSummary[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
}

export interface QueueWriteResult {
  queuePath: string;
  stories: QueueStory[];
  written: number;
  skippedExisting: number;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
