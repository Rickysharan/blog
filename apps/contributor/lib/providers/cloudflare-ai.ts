import { fetchJson } from "./http";
import { ProviderError, type ReviewProviders } from "./types";
import { stageResult } from "../review/types";

type CloudflareConfig = { accountId: string; token: string; textModel: string; imageModel: string; embeddingModel: string };

function endpoint(accountId: string, model: string): string {
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(accountId) || !model || model.includes("/../") || model.includes("http")) throw new ProviderError("provider_configuration_invalid", "disabled", false);
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`;
}

function stageFromResult(stage: "text_safety" | "image_safety", value: unknown, model: string): ReturnType<typeof stageResult> {
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const outcome = result.outcome === "reject" || result.outcome === "manual_review" ? result.outcome : "pass";
  const reasons = Array.isArray(result.reasons) ? result.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 8) : [];
  const score = typeof result.score === "number" && Number.isFinite(result.score) ? Math.max(0, Math.min(1, result.score)) : null;
  return stageResult(stage, outcome, reasons, score, "cloudflare-workers-ai", model, false);
}

export class CloudflareAIProvider implements ReviewProviders {
  constructor(private readonly config: CloudflareConfig) {}

  private async run(model: string, body: unknown): Promise<unknown> {
    return fetchJson(endpoint(this.config.accountId, model), { method: "POST", headers: { authorization: `Bearer ${this.config.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async classifyText(input: { text: string; language: string; idempotencyKey: string }) {
    try {
      const response = await this.run(this.config.textModel, { text: input.text.slice(0, 40_000), language: input.language, idempotency_key: input.idempotencyKey });
      const result = response && typeof response === "object" && "result" in response ? (response as { result: unknown }).result : response;
      return stageFromResult("text_safety", result, this.config.textModel);
    } catch (error) { return stageResult("text_safety", "manual_review", [error instanceof ProviderError ? error.code : "provider_unavailable"], null, "cloudflare-workers-ai", this.config.textModel, error instanceof ProviderError ? error.retryable : true); }
  }

  async classifyImage(input: { signedUrl: string; idempotencyKey: string }) {
    try {
      const response = await this.run(this.config.imageModel, { image_url: input.signedUrl, idempotency_key: input.idempotencyKey });
      const result = response && typeof response === "object" && "result" in response ? (response as { result: unknown }).result : response;
      return stageFromResult("image_safety", result, this.config.imageModel);
    } catch (error) { return stageResult("image_safety", "manual_review", [error instanceof ProviderError ? error.code : "provider_unavailable"], null, "cloudflare-workers-ai", this.config.imageModel, error instanceof ProviderError ? error.retryable : true); }
  }

  async embed(input: { text: string; idempotencyKey: string }): Promise<readonly number[]> {
    const response = await this.run(this.config.embeddingModel, { text: input.text.slice(0, 40_000), idempotency_key: input.idempotencyKey });
    const result = response && typeof response === "object" && "result" in response ? (response as { result: unknown }).result : response;
    if (!Array.isArray(result) || result.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new ProviderError("provider_embedding_malformed", "degraded", false);
    return result;
  }

  async search(): Promise<readonly never[]> {
    throw new ProviderError("provider_search_not_configured", "disabled", false);
  }
}
