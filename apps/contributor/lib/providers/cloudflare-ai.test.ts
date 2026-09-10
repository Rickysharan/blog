import { afterEach, describe, expect, test, vi } from "vitest";

import { CloudflareAIProvider } from "./cloudflare-ai";

const provider = () => new CloudflareAIProvider({ accountId: "account123", token: "secret-token", textModel: "@cf/test/text", imageModel: "@cf/test/image", embeddingModel: "@cf/test/embed" });

afterEach(() => vi.restoreAllMocks());

describe("Cloudflare Workers AI adapter", () => {
  test("maps successful safety and embedding responses without exposing input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { outcome: "pass", score: 0.9, reasons: [] } }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [0.1, 0.2] }), { status: 200 }));
    await expect(provider().classifyText({ text: "private prose", language: "en", idempotencyKey: "k" })).resolves.toMatchObject({ outcome: "pass", provider: "cloudflare-workers-ai" });
    await expect(provider().embed({ text: "private prose", idempotencyKey: "k" })).resolves.toEqual([0.1, 0.2]);
    expect(fetchMock.mock.calls[0]?.[1]).not.toBeUndefined();
  });

  test("fails closed on unauthorized and malformed responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("no", { status: 401 }));
    await expect(provider().classifyImage({ signedUrl: "https://signed.example/image", idempotencyKey: "k" })).resolves.toMatchObject({ outcome: "manual_review", reasons: ["provider_unauthorized"] });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(provider().embed({ text: "x", idempotencyKey: "k" })).rejects.toMatchObject({ code: "provider_malformed_json" });
  });

  test("maps quota exhaustion to a bounded manual result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota", { status: 429 }));
    const result = await provider().classifyText({ text: "x", language: "en", idempotencyKey: "k" });
    expect(result).toMatchObject({ outcome: "manual_review", reasons: ["provider_quota_exhausted"], retryable: false });
  });
});
