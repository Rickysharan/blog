import type { PublicationPayload } from "@omnilede/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  buildPublicationPayload,
  createSupabasePublicationOutboxStore,
  processPublicationOutbox,
  type PublicationOutboxClaim,
  type PublicationOutboxStore,
  type PublicationRpcGateway,
} from "./outbox";

const claim: PublicationOutboxClaim = {
  outboxId: "10000000-0000-4000-8000-000000000010",
  publicationId: "10000000-0000-4000-8000-000000000011",
  submissionId: "10000000-0000-4000-8000-000000000012",
  submissionVersion: 4,
  authorId: "10000000-0000-4000-8000-000000000013",
  contributorName: "Fixture Contributor",
  title: "A careful global markets update",
  slug: "a-careful-global-markets-update-10000000",
  approvedAt: "2026-08-28T10:00:00.000Z",
  category: "finance",
  region: "global",
  language: "en",
  sourceName: "Fixture Source",
  sourceUrl: "https://example.test/source",
  privateImagePath:
    "10000000-0000-4000-8000-000000000013/10000000-0000-4000-8000-000000000012/10000000-0000-4000-8000-000000000014.webp",
  guidelinesVersion: "2026-08-27",
  contentDocument: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Global markets moved after the policy update. Investors are watching the next meeting.",
          },
        ],
      },
    ],
  },
  rewardPoints: 25,
  attemptCount: 1,
  leaseToken: "10000000-0000-4000-8000-000000000015",
};

const receipt = {
  publicationId: claim.publicationId,
  commitSha: "a".repeat(40),
  commitUrl: `https://github.com/owner/repository/commit/${"a".repeat(40)}`,
  articlePath: `content/articles/finance/${claim.slug}.mdx`,
  articleUrl: `https://omnilede.example/article/${claim.slug}`,
  replayed: false,
};

function outboxStore(items: PublicationOutboxClaim[]): PublicationOutboxStore & {
  completed: unknown[];
  failed: unknown[];
} {
  const queue = [...items];
  const result: PublicationOutboxStore & { completed: unknown[]; failed: unknown[] } = {
    completed: [],
    failed: [],
    claim: vi.fn(async () => queue.shift() ?? null),
    complete: vi.fn(async (input) => {
      result.completed.push(input);
    }),
    fail: vi.fn(async (input) => {
      result.failed.push(input);
    }),
  };
  return result;
}

function rpcGateway(responses: Array<{ data: unknown; error: null }>) {
  const rpc = vi.fn<PublicationRpcGateway["rpc"]>(() => {
    const response = Promise.resolve(responses.shift()!);
    return {
      abortSignal: () => response,
    };
  });
  return { rpc };
}

describe("buildPublicationPayload", () => {
  test("derives a bounded publication contract without exposing the private image path", () => {
    const payload = buildPublicationPayload(
      claim,
      `https://project.supabase.co/storage/v1/object/public/published-images/${claim.publicationId}.webp`,
    );

    expect(payload).toMatchObject({
      publicationId: claim.publicationId,
      submissionId: claim.submissionId,
      submissionVersion: 4,
      date: "2026-08-28",
      tags: ["finance", "global"],
      excerpt: "Global markets moved after the policy update. Investors are watching the next meeting.",
      readTime: 1,
    });
    expect(JSON.stringify(payload)).not.toContain("submission-images");
    expect(JSON.stringify(payload)).not.toContain(claim.privateImagePath);
  });
});

describe("processPublicationOutbox", () => {
  test("prepares the derivative, publishes, and acknowledges the commit in order", async () => {
    const events: string[] = [];
    const store = outboxStore([claim]);
    vi.mocked(store.claim).mockImplementation(async () => {
      events.push("claim");
      return claim;
    });
    vi.mocked(store.complete).mockImplementation(async (input) => {
      events.push("complete");
      store.completed.push(input);
    });
    const result = await processPublicationOutbox(
      {
        store,
        prepareImage: async () => {
          events.push("image");
          return { coverImage: `https://images.example/${claim.publicationId}.webp` };
        },
        publish: async (payload: PublicationPayload) => {
          events.push("publish");
          expect(payload.publicationId).toBe(claim.publicationId);
          return { disposition: "published", receipt };
        },
        verifyDeployment: async () => {
          events.push("deploy");
          return true;
        },
      },
      { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 10_000 },
    );

    expect(events).toEqual(["claim", "image", "publish", "deploy", "complete"]);
    expect(store.completed).toEqual([
      {
        outboxId: claim.outboxId,
        workerId: "10000000-0000-4000-8000-000000000099",
        leaseToken: claim.leaseToken,
        receipt,
        signal: expect.any(AbortSignal),
      },
    ]);
    expect(store.failed).toEqual([]);
    expect(result).toEqual({ claimed: 1, published: 1, failed: 0, stopped: "max_items" });
  });

  test("records a bounded retry after a receiver outage", async () => {
    const store = outboxStore([claim]);
    const now = Date.parse("2026-08-28T10:00:00Z");
    await processPublicationOutbox(
      {
        store,
        prepareImage: async () => ({ coverImage: `https://images.example/${claim.publicationId}.webp` }),
        publish: async () => ({ disposition: "retry", code: "service_unavailable" }),
        verifyDeployment: async () => true,
        now: () => now,
      },
      { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 10_000 },
    );

    expect(store.failed).toEqual([
      {
        outboxId: claim.outboxId,
        workerId: "10000000-0000-4000-8000-000000000099",
        leaseToken: claim.leaseToken,
        disposition: "retry",
        code: "service_unavailable",
        reason: "Publication receiver is temporarily unavailable",
        retryAt: "2026-08-28T10:00:30.000Z",
        signal: expect.any(AbortSignal),
      },
    ]);
  });

  test("pauses the batch after an authentication failure", async () => {
    const second = { ...claim, outboxId: "20000000-0000-4000-8000-000000000010" };
    const store = outboxStore([claim, second]);
    const result = await processPublicationOutbox(
      {
        store,
        prepareImage: async () => ({ coverImage: `https://images.example/${claim.publicationId}.webp` }),
        publish: async () => ({ disposition: "paused", code: "invalid_signature" }),
        verifyDeployment: async () => true,
      },
      { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 5, maxRuntimeMs: 10_000 },
    );

    expect(store.claim).toHaveBeenCalledTimes(1);
    expect(result.stopped).toBe("integration_paused");
    expect(store.failed[0]).toMatchObject({ disposition: "paused", code: "invalid_signature", retryAt: null });
  });

  test("leaves a successful remote publication leased when database acknowledgement fails", async () => {
    const store = outboxStore([claim]);
    vi.mocked(store.complete).mockRejectedValue(new Error("database unavailable"));

    const result = await processPublicationOutbox(
      {
        store,
        prepareImage: async () => ({ coverImage: `https://images.example/${claim.publicationId}.webp` }),
        publish: async () => ({ disposition: "published", receipt: { ...receipt, replayed: true } }),
        verifyDeployment: async () => true,
      },
      { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 10_000 },
    );

    expect(store.fail).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, published: 0, failed: 1, stopped: "acknowledgement_unavailable" });
  });

  test("keeps a committed article retryable and unacknowledged until its deployment is observable", async () => {
    const store = outboxStore([claim]);
    const result = await processPublicationOutbox(
      {
        store,
        prepareImage: async () => ({ coverImage: `https://images.example/${claim.publicationId}.webp` }),
        publish: async () => ({ disposition: "published", receipt }),
        verifyDeployment: async () => false,
      },
      { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 10_000 },
    );

    expect(store.complete).not.toHaveBeenCalled();
    expect(store.failed[0]).toMatchObject({
      disposition: "retry",
      code: "deployment_not_ready",
      reason: "Published commit is awaiting a successful site deployment",
    });
    expect(result).toEqual({ claimed: 1, published: 0, failed: 1, stopped: "max_items" });
  });

  test("does not start the publication network call after image preparation exhausts the wall-clock budget", async () => {
    const store = outboxStore([claim, { ...claim, outboxId: "20000000-0000-4000-8000-000000000010" }]);
    let current = 1_000;
    const publish = vi.fn(async () => ({ disposition: "published" as const, receipt }));
    const result = await processPublicationOutbox(
      {
        store,
        prepareImage: async () => {
          current += 2_000;
          return { coverImage: `https://images.example/${claim.publicationId}.webp` };
        },
        publish,
        verifyDeployment: async () => true,
        now: () => current,
      },
      { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 5, maxRuntimeMs: 1_000 },
    );

    expect(store.claim).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(result.stopped).toBe("max_runtime");
  });

  test("returns within the wall-clock budget when image preparation stalls", async () => {
    vi.useFakeTimers();
    try {
      const store = outboxStore([claim]);
      const processing = processPublicationOutbox(
        {
          store,
          prepareImage: async () => new Promise(() => undefined),
          publish: async () => ({ disposition: "published", receipt }),
          verifyDeployment: async () => true,
        },
        { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 1_000 },
      );
      const overBudget = Symbol("over-budget");
      const observed = Promise.race([
        processing,
        new Promise<typeof overBudget>((resolve) => setTimeout(() => resolve(overBudget), 1_001)),
      ]);

      await vi.advanceTimersByTimeAsync(1_001);

      expect(await observed).not.toBe(overBudget);
      await expect(processing).resolves.toMatchObject({ claimed: 1, failed: 1, stopped: "max_items" });
      expect(store.failed[0]).toMatchObject({ disposition: "retry", code: "image_service_unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("returns within the wall-clock budget when the claim RPC stalls", async () => {
    vi.useFakeTimers();
    try {
      const store = outboxStore([]);
      vi.mocked(store.claim).mockImplementation(
        async ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      );
      const processing = processPublicationOutbox(
        {
          store,
          prepareImage: async () => ({ coverImage: "https://images.example/unused.webp" }),
          publish: async () => ({ disposition: "published", receipt }),
          verifyDeployment: async () => true,
        },
        { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 1_000 },
      );

      await vi.advanceTimersByTimeAsync(1_001);

      await expect(processing).resolves.toMatchObject({ stopped: "outbox_unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("returns within the wall-clock budget when the completion RPC stalls", async () => {
    vi.useFakeTimers();
    try {
      const store = outboxStore([claim]);
      vi.mocked(store.complete).mockImplementation(
        async ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      );
      const processing = processPublicationOutbox(
        {
          store,
          prepareImage: async () => ({ coverImage: `https://images.example/${claim.publicationId}.webp` }),
          publish: async () => ({ disposition: "published", receipt }),
          verifyDeployment: async () => true,
        },
        { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 1_000 },
      );

      await vi.advanceTimersByTimeAsync(1_001);

      await expect(processing).resolves.toMatchObject({ stopped: "acknowledgement_unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("returns within the wall-clock budget when the failure RPC stalls", async () => {
    vi.useFakeTimers();
    try {
      const store = outboxStore([claim]);
      vi.mocked(store.fail).mockImplementation(
        async ({ signal }) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      );
      const processing = processPublicationOutbox(
        {
          store,
          prepareImage: async () => ({ coverImage: `https://images.example/${claim.publicationId}.webp` }),
          publish: async () => ({ disposition: "retry", code: "service_unavailable" }),
          verifyDeployment: async () => true,
        },
        { workerId: "10000000-0000-4000-8000-000000000099", maxItems: 1, maxRuntimeMs: 1_000 },
      );

      await vi.advanceTimersByTimeAsync(1_001);

      await expect(processing).resolves.toMatchObject({ stopped: "acknowledgement_unavailable" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Supabase publication outbox adapter", () => {
  test("terminalizes a malformed leased claim and continues to the next item", async () => {
    const malformed = { ...claim, sourceName: "x".repeat(121) };
    const { rpc } = rpcGateway([
      { data: malformed, error: null },
      { data: { state: "manual_review" }, error: null },
      { data: claim, error: null },
    ]);
    const store = createSupabasePublicationOutboxStore({ rpc });
    const signal = new AbortController().signal;

    await expect(store.claim({
      workerId: "10000000-0000-4000-8000-000000000099",
      leaseSeconds: 60,
      signal,
    })).resolves.toEqual(claim);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_publication_outbox",
      "fail_publication_outbox",
      "claim_publication_outbox",
    ]);
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_outbox_id: claim.outboxId,
      p_worker_id: "10000000-0000-4000-8000-000000000099",
      p_lease_token: claim.leaseToken,
      p_disposition: "manual_review",
      p_error_code: "publication_claim_invalid",
      p_retry_at: null,
    });
  });

  test("uses only the narrow public RPC gateway and preserves lease tokens", async () => {
    const { rpc } = rpcGateway([
      { data: claim, error: null },
      { data: receipt, error: null },
      { data: { state: "retryable" }, error: null },
    ]);
    const store = createSupabasePublicationOutboxStore({ rpc });
    const signal = new AbortController().signal;

    await expect(store.claim({ workerId: "10000000-0000-4000-8000-000000000099", leaseSeconds: 60, signal })).resolves.toEqual(claim);
    await store.complete({
      outboxId: claim.outboxId,
      workerId: "10000000-0000-4000-8000-000000000099",
      leaseToken: claim.leaseToken,
      receipt,
      signal,
    });
    await store.fail({
      outboxId: claim.outboxId,
      workerId: "10000000-0000-4000-8000-000000000099",
      leaseToken: claim.leaseToken,
      disposition: "retry",
      code: "service_unavailable",
      reason: "Publication receiver is temporarily unavailable",
      retryAt: "2026-08-28T10:00:30.000Z",
      signal,
    });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_publication_outbox",
      "complete_publication_outbox",
      "fail_publication_outbox",
    ]);
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({
      p_outbox_id: claim.outboxId,
      p_worker_id: "10000000-0000-4000-8000-000000000099",
      p_lease_token: claim.leaseToken,
      p_commit_sha: receipt.commitSha,
    });
  });

  test("attaches the caller's AbortSignal to every RPC query", async () => {
    const abortSignals: AbortSignal[] = [];
    const responses = [
      { data: claim, error: null },
      { data: receipt, error: null },
      { data: { state: "retryable" }, error: null },
    ];
    const rpc = vi.fn<PublicationRpcGateway["rpc"]>(() => {
      const response = Promise.resolve(responses.shift()!);
      return {
        abortSignal(signal: AbortSignal) {
          abortSignals.push(signal);
          return response;
        },
      };
    });
    const store = createSupabasePublicationOutboxStore({ rpc });
    const controller = new AbortController();

    await store.claim({
      workerId: "10000000-0000-4000-8000-000000000099",
      leaseSeconds: 60,
      signal: controller.signal,
    });
    await store.complete({
      outboxId: claim.outboxId,
      workerId: "10000000-0000-4000-8000-000000000099",
      leaseToken: claim.leaseToken,
      receipt,
      signal: controller.signal,
    });
    await store.fail({
      outboxId: claim.outboxId,
      workerId: "10000000-0000-4000-8000-000000000099",
      leaseToken: claim.leaseToken,
      disposition: "retry",
      code: "service_unavailable",
      reason: "Publication receiver is temporarily unavailable",
      retryAt: "2026-08-28T10:00:30.000Z",
      signal: controller.signal,
    });

    expect(abortSignals).toEqual([controller.signal, controller.signal, controller.signal]);
  });
});
