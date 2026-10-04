import { beforeEach, describe, expect, it, vi } from "vitest";

import { sealToken } from "../crypto/token-vault";

const d = vi.hoisted(() => ({
  credentialResult: { data: null as Record<string, string> | null, error: null as unknown },
  deleteIn: vi.fn(),
  updateIn: vi.fn()
}));

vi.mock("../supabase/server", () => ({
  createServiceSupabaseClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({ in: () => ({ limit: () => ({ maybeSingle: async () => d.credentialResult }) }) }),
        delete: () => ({ in: d.deleteIn })
      })
    }),
    from: () => ({ update: (values: unknown) => ({ in: (...args: unknown[]) => d.updateIn(values, ...args) }) })
  })
}));

import { revokeGoogleCredentials } from "./connections";

const key = Buffer.alloc(32, 5).toString("base64");
const protectedCredential = (() => {
  const sealed = sealToken(JSON.stringify({ refreshToken: "refresh-fixture-never-log" }), key);
  const bytea = (value: string) => `\\x${Buffer.from(value, "base64").toString("hex")}`;
  return { ciphertext: bytea(sealed.ciphertext), iv: bytea(sealed.iv), authentication_tag: bytea(sealed.authenticationTag) };
})();

beforeEach(() => {
  vi.clearAllMocks();
  d.credentialResult = { data: protectedCredential, error: null };
  d.deleteIn.mockResolvedValue({ error: null });
  d.updateIn.mockResolvedValue({ error: null });
});

describe("Google revocation", () => {
  it("revokes remotely before deleting local ciphertext", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await revokeGoogleCredentials(key, fetcher);
    expect(result).toBe("disconnected");
    expect(fetcher).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenCalledBefore(d.deleteIn);
    expect(JSON.stringify(result)).not.toContain("refresh-fixture-never-log");
  });

  it("preserves ciphertext and marks reconnect-required when Google revocation fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    expect(await revokeGoogleCredentials(key, fetcher)).toBe("reconnect-required");
    expect(d.deleteIn).not.toHaveBeenCalled();
    expect(d.updateIn).toHaveBeenCalledWith({ state: "unavailable", last_checked_at: expect.any(String) }, "provider", expect.any(Array));
  });
});
