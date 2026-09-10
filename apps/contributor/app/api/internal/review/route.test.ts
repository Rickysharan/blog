import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), service: { schema: vi.fn(() => ({ rpc: vi.fn() })) } }));
vi.mock("../../../../lib/supabase/server", () => ({ createServiceSupabaseClient: vi.fn(() => mocks.service) }));

import { POST } from "./route";
import { signPayload } from "../../../../lib/security/hmac";

function request(body = '{"submissionIds":[]}', overrides: Record<string, string> = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = "nonce-1234567890";
  return new Request("https://contributors.example/api/internal/review", { method: "POST", body, headers: { "x-omnilede-audience": "contributor-review", "x-omnilede-timestamp": String(timestamp), "x-omnilede-nonce": nonce, "x-omnilede-signature": `sha256=${signPayload("review-secret", timestamp, nonce, body)}`, ...overrides } });
}

describe("internal review route", () => {
  beforeEach(() => { process.env.REVIEW_HMAC_SECRET = "review-secret"; mocks.service.schema.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: true, error: null }) }); });

  test("rejects invalid signature, timestamp, and audience", async () => {
    expect((await POST(request("{}", { "x-omnilede-signature": "sha256=bad" }))).status).toBe(401);
    expect((await POST(request("{}", { "x-omnilede-timestamp": "1" }))).status).toBe(401);
    expect((await POST(request("{}", { "x-omnilede-audience": "wrong" }))).status).toBe(401);
  });

  test("caps a valid batch and records a replay nonce before processing", async () => {
    const response = await POST(request(JSON.stringify({ submissionIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"], maxItems: 1 })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, processed: 1 });
  });
});
