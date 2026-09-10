import type { StageResult } from "../review/types";

export type ProviderStatus = "available" | "degraded" | "exhausted" | "disabled";

export type SearchEvidence = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

export interface ReviewProviders {
  classifyText(input: { text: string; language: string; idempotencyKey: string }): Promise<StageResult>;
  classifyImage(input: { signedUrl: string; idempotencyKey: string }): Promise<StageResult>;
  embed(input: { text: string; idempotencyKey: string }): Promise<readonly number[]>;
  search(input: { query: string; maxResults: number }): Promise<readonly SearchEvidence[]>;
}

export class ProviderError extends Error {
  constructor(readonly code: string, readonly status: ProviderStatus, readonly retryable: boolean) {
    super(code);
    this.name = "ProviderError";
  }
}
