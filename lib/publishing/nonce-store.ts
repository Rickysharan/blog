import "server-only";

import { createHash } from "node:crypto";

import { canonicalJson } from "@omnilede/contracts";

type NonceStoreClient = {
  schema: (schema: "public") => {
    rpc: (
      functionName: "claim_publication_nonce",
      args: Record<string, string>,
    ) => PromiseLike<{ data: string | null; error: { message: string } | null }>;
  };
};

export type PublicationNonceClaim =
  | { status: "claimed" }
  | { status: "replayed" }
  | { status: "conflict" }
  | { status: "unavailable" };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Claims a nonce through the database's single transactional RPC before any external work. */
export async function claimPublicationNonce(
  client: NonceStoreClient,
  input: {
    nonce: string;
    audience: string;
    publicationId: string;
    body: unknown;
    receivedAt: Date;
    expiresAt: Date;
  },
): Promise<PublicationNonceClaim> {
  if (!Number.isFinite(input.receivedAt.getTime()) || !Number.isFinite(input.expiresAt.getTime())) {
    throw new TypeError("Publication nonce timestamps must be valid");
  }

  let result: { data: string | null; error: { message: string } | null };
  try {
    result = await client.schema("public").rpc("claim_publication_nonce", {
      p_nonce_digest: sha256(input.nonce),
      p_audience: input.audience,
      p_publication_id: input.publicationId,
      p_body_digest: sha256(canonicalJson(input.body as Record<string, unknown>)),
      p_received_at: input.receivedAt.toISOString(),
      p_expires_at: input.expiresAt.toISOString(),
    });
  } catch {
    return { status: "unavailable" };
  }

  if (result.error || result.data === null) return { status: "unavailable" };
  if (result.data === "claimed" || result.data === "replayed" || result.data === "conflict") {
    return { status: result.data };
  }
  return { status: "unavailable" };
}
