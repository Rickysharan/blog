import { fetchJson } from "./http";
import { ProviderError, type ReviewProviders, type SearchEvidence } from "./types";
import { stageResult } from "../review/types";

export class TavilyProvider implements ReviewProviders {
  constructor(private readonly apiKey: string) {}

  async search(input: { query: string; maxResults: number }): Promise<readonly SearchEvidence[]> {
    if (input.maxResults < 1 || input.maxResults > 5) throw new ProviderError("search_limit_invalid", "disabled", false);
    const response = await fetchJson("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: this.apiKey, query: input.query.slice(0, 500), max_results: input.maxResults, search_depth: "basic", include_answer: false }), retry: false });
    const results = response && typeof response === "object" && Array.isArray((response as { results?: unknown }).results) ? (response as { results: unknown[] }).results : [];
    return results.slice(0, input.maxResults).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      if (typeof value.title !== "string" || typeof value.url !== "string") return [];
      let parsedUrl: URL; try { parsedUrl = new URL(value.url); } catch { return []; }
      if (parsedUrl.protocol !== "https:") return [];
      const domain = parsedUrl.hostname;
      return [{ title: value.title.slice(0, 300), url: value.url, domain: domain.slice(0, 160), snippet: typeof value.content === "string" ? value.content.slice(0, 500) : "" }];
    });
  }

  async classifyText(): Promise<ReturnType<typeof stageResult>> { return stageResult("text_safety", "manual_review", ["provider_not_configured"], null, "tavily", "search-only"); }
  async classifyImage(): Promise<ReturnType<typeof stageResult>> { return stageResult("image_safety", "manual_review", ["provider_not_configured"], null, "tavily", "search-only"); }
  async embed(): Promise<readonly number[]> { throw new ProviderError("provider_embedding_not_configured", "disabled", false); }
}
