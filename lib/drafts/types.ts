import type { CategorySlug } from "@/lib/config/categories";
import type { ArticleDocument } from "@/lib/content/schema";

export type DraftRef = { category: CategorySlug; filename: string };

export type DraftErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "storage_unavailable";

export class DraftRepositoryError extends Error {
  constructor(
    public readonly code: DraftErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DraftRepositoryError";
  }
}

export interface DraftSummary {
  ref: DraftRef;
  title: string;
  date: string;
  excerpt: string;
  category: CategorySlug;
  version: string;
}

export interface DraftDocument extends DraftSummary {
  mdx: string;
  article: ArticleDocument;
}

export interface PublishResult {
  articlePath: string;
  commitUrl?: string;
}

export interface DraftRepository {
  list(): Promise<DraftSummary[]>;
  read(ref: DraftRef): Promise<DraftDocument>;
  save(ref: DraftRef, mdx: string, expectedVersion?: string): Promise<DraftDocument>;
  publish(
    ref: DraftRef,
    mdx: string,
    expectedVersion?: string,
  ): Promise<PublishResult>;
  discard(ref: DraftRef, expectedVersion?: string): Promise<void>;
}
