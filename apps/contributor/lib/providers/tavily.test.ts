import { afterEach, describe, expect, test, vi } from "vitest";

import { TavilyProvider } from "./tavily";

afterEach(() => vi.restoreAllMocks());

describe("Tavily adapter", () => {
  test("bounds results and strips untrusted fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Story", url: "https://news.example/story", content: "bounded evidence", raw: "discard" }, { title: "Bad", url: "javascript:alert(1)" }] }), { status: 200 }));
    await expect(new TavilyProvider("tvly-secret").search({ query: "topic", maxResults: 5 })).resolves.toEqual([{ title: "Story", url: "https://news.example/story", domain: "news.example", snippet: "bounded evidence" }]);
  });

  test("rejects an over-large requested result count", async () => {
    await expect(new TavilyProvider("tvly-secret").search({ query: "topic", maxResults: 6 })).rejects.toMatchObject({ code: "search_limit_invalid" });
  });
});
