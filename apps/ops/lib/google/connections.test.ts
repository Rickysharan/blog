import { beforeEach, describe, expect, it, vi } from "vitest";

import { sealToken } from "../crypto/token-vault";
import { createGoogleConnectionService, GOOGLE_PROVIDERS, type GoogleConnectionStore } from "./connections";
import type { GoogleCredentials } from "./oauth";

const key = Buffer.alloc(32, 5).toString("base64");
const bytea = (value: string) => `\\x${Buffer.from(value, "base64").toString("hex")}`;
const protectedCredential = (() => {
  const sealed = sealToken(JSON.stringify({ refreshToken: "refresh-fixture-never-log" }), key);
  return { ciphertext: bytea(sealed.ciphertext), iv: bytea(sealed.iv), authentication_tag: bytea(sealed.authenticationTag) };
})();
const credentials: GoogleCredentials = {
  accessToken: "access-fixture", refreshToken: "refresh-fixture-never-log", expiresAt: null,
  scopes: ["openid", "email"], email: "operator@example.com", subject: "subject"
};

function storeFixture() {
  return {
    stageSetup: vi.fn().mockResolvedValue(undefined),
    saveCredentials: vi.fn().mockResolvedValue(undefined),
    markConnected: vi.fn().mockResolvedValue(undefined),
    markUnavailable: vi.fn().mockResolvedValue(undefined),
    readCredential: vi.fn().mockResolvedValue(protectedCredential),
    deleteCredentials: vi.fn().mockResolvedValue(undefined),
    markDisconnected: vi.fn().mockResolvedValue(undefined),
    listConnections: vi.fn().mockResolvedValue(GOOGLE_PROVIDERS.map((provider) => ({ provider, state: "connected", account_label: "Google account connected", property_label: "Safe property", connected_at: "2026-10-04T10:00:00.000Z", last_checked_at: "2026-10-04T10:00:00.000Z" }))),
    listCredentials: vi.fn().mockResolvedValue(GOOGLE_PROVIDERS.map((provider) => ({ provider, scopes: ["openid", "email"] })))
  } satisfies GoogleConnectionStore;
}

describe("Google connection persistence", () => {
  let store: ReturnType<typeof storeFixture>;
  beforeEach(() => { store = storeFixture(); });

  it("stores encrypted credentials while unavailable and marks connected only last", async () => {
    await createGoogleConnectionService(store).persist(credentials, key);
    expect(store.stageSetup).toHaveBeenCalledBefore(store.saveCredentials);
    expect(store.saveCredentials).toHaveBeenCalledBefore(store.markConnected);
    expect(JSON.stringify(store.saveCredentials.mock.calls)).not.toContain("refresh-fixture-never-log");
  });

  it.each(["stageSetup", "saveCredentials", "markConnected"] as const)("fails closed when %s fails", async (step) => {
    store[step].mockRejectedValue(new Error("db failed"));
    await expect(createGoogleConnectionService(store).persist(credentials, key)).rejects.toThrow("Google connection could not be saved");
    if (step !== "stageSetup") expect(store.markUnavailable).toHaveBeenCalled();
    if (step !== "markConnected") expect(store.markConnected).not.toHaveBeenCalled();
  });

  it("does not project connected when any provider credential is missing", async () => {
    store.listCredentials.mockResolvedValue([{ provider: "google-analytics", scopes: ["openid"] }]);
    const result = await createGoogleConnectionService(store).list();
    expect(result.find(({ provider }) => provider === "google-search-console")).toMatchObject({ state: "unavailable", reconnectRequired: true, scopes: [] });
  });

  it("remains failed closed when setup compensation also reports a DB failure", async () => {
    store.saveCredentials.mockRejectedValue(new Error("db failed"));
    store.markUnavailable.mockRejectedValue(new Error("compensation failed"));
    await expect(createGoogleConnectionService(store).persist(credentials, key)).rejects.toThrow("Google connection could not be saved");
    expect(store.markConnected).not.toHaveBeenCalled();
  });

  it.each(["listConnections", "listCredentials"] as const)("fails closed when %s fails", async (step) => {
    store[step].mockRejectedValue(new Error("db failed"));
    await expect(createGoogleConnectionService(store).list()).rejects.toThrow("temporarily unavailable");
  });
});

describe("Google revocation", () => {
  let store: ReturnType<typeof storeFixture>;
  beforeEach(() => { store = storeFixture(); });

  it("establishes unavailable, revokes remotely, deletes ciphertext, then marks disconnected", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await createGoogleConnectionService(store).revoke(key, fetcher);
    expect(result).toBe("disconnected");
    expect(store.markUnavailable).toHaveBeenCalledBefore(store.readCredential);
    expect(store.readCredential).toHaveBeenCalledBefore(fetcher);
    expect(fetcher).toHaveBeenCalledBefore(store.deleteCredentials);
    expect(store.deleteCredentials).toHaveBeenCalledBefore(store.markDisconnected);
  });

  it("preserves ciphertext and unavailable state when remote revocation fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    expect(await createGoogleConnectionService(store).revoke(key, fetcher)).toBe("reconnect-required");
    expect(store.deleteCredentials).not.toHaveBeenCalled();
    expect(store.markDisconnected).not.toHaveBeenCalled();
  });

  it("marks disconnected without a remote call when no ciphertext exists", async () => {
    store.readCredential.mockResolvedValue(null);
    const fetcher = vi.fn();
    expect(await createGoogleConnectionService(store).revoke(key, fetcher)).toBe("disconnected");
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.deleteCredentials).not.toHaveBeenCalled();
    expect(store.markDisconnected).toHaveBeenCalledOnce();
  });

  it.each(["markUnavailable", "readCredential", "deleteCredentials", "markDisconnected"] as const)("fails closed when %s fails", async (step) => {
    store[step].mockRejectedValue(new Error("db failed"));
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(createGoogleConnectionService(store).revoke(key, fetcher)).rejects.toThrow("Google connection could not be revoked");
    if (step === "markUnavailable" || step === "readCredential") expect(fetcher).not.toHaveBeenCalled();
    if (step === "deleteCredentials") expect(store.markDisconnected).not.toHaveBeenCalled();
  });
});
