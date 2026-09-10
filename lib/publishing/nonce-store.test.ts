import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { claimPublicationNonce } from "./nonce-store";

const nonce = "10000000-0000-4000-8000-000000000001";
const publicationId = "20000000-0000-4000-0000-000000000001";
const receivedAt = new Date("2026-08-28T12:00:00.000Z");
const expiresAt = new Date("2026-08-28T12:05:00.000Z");

function clientWith(data: string | null, error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { schema: vi.fn(() => ({ rpc })) }, rpc };
}

describe("claimPublicationNonce", () => {
  test("claims a digest before external publication work", async () => {
    const { client, rpc } = clientWith("claimed");
    const body = { title: "First", publicationId };

    await expect(
      claimPublicationNonce(client, { nonce, audience: "omnilede-blog-publish-v1", publicationId, body, receivedAt, expiresAt }),
    ).resolves.toEqual({ status: "claimed" });

    expect(rpc).toHaveBeenCalledWith("claim_publication_nonce", {
      p_nonce_digest: createHash("sha256").update(nonce, "utf8").digest("hex"),
      p_audience: "omnilede-blog-publish-v1",
      p_publication_id: publicationId,
      p_body_digest: createHash("sha256").update('{"publicationId":"20000000-0000-4000-0000-000000000001","title":"First"}', "utf8").digest("hex"),
      p_received_at: receivedAt.toISOString(),
      p_expires_at: expiresAt.toISOString(),
    });
    expect(client.schema).toHaveBeenCalledWith("public");
  });

  test("uses an exposed service-only gateway while retaining a private nonce table and database-clock cleanup", async () => {
    const migration = await readFile(
      path.join(process.cwd(), "supabase/migrations/20260828161632_publication_nonces.sql"),
      "utf8",
    );

    expect(migration).toMatch(/create or replace function public\.claim_publication_nonce\(/);
    expect(migration).toMatch(/revoke all on function public\.claim_publication_nonce[\s\S]*service_role;/);
    expect(migration).toMatch(/grant execute on function public\.claim_publication_nonce[\s\S]*to service_role;/);
    expect(migration).toMatch(/where expires_at <= now\(\);/);
    expect(migration).not.toContain("where expires_at <= p_received_at;");
  });

  test("returns the original idempotency state only for the same publication and body", async () => {
    const { client } = clientWith("replayed");

    await expect(
      claimPublicationNonce(client, { nonce, audience: "omnilede-blog-publish-v1", publicationId, body: { publicationId, title: "First" }, receivedAt, expiresAt }),
    ).resolves.toEqual({ status: "replayed" });
  });

  test("fails closed for a mismatched replay or unavailable store", async () => {
    const conflict = clientWith("conflict");
    await expect(
      claimPublicationNonce(conflict.client, { nonce, audience: "omnilede-blog-publish-v1", publicationId, body: { publicationId }, receivedAt, expiresAt }),
    ).resolves.toEqual({ status: "conflict" });

    const unavailable = clientWith(null, { message: "database unavailable" });
    await expect(
      claimPublicationNonce(unavailable.client, { nonce, audience: "omnilede-blog-publish-v1", publicationId, body: { publicationId }, receivedAt, expiresAt }),
    ).resolves.toEqual({ status: "unavailable" });

    const rejectedRpc = vi.fn().mockRejectedValue(new Error("connection reset"));
    await expect(
      claimPublicationNonce(
        { schema: vi.fn(() => ({ rpc: rejectedRpc })) },
        { nonce, audience: "omnilede-blog-publish-v1", publicationId, body: { publicationId }, receivedAt, expiresAt },
      ),
    ).resolves.toEqual({ status: "unavailable" });
  });
});
