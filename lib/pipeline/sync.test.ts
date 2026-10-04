import { afterEach, describe, expect, it } from "vitest";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import { DraftRepositoryError, type DraftDocument, type DraftRef } from "@/lib/drafts/types";
import { GitDataClientError } from "@/lib/github/git-data-client";
import { deliverDraft, syncDrafts } from "@/lib/pipeline/sync";
import { createTemporaryContentRoot, makeValidMdx } from "@/tests/helpers/temp-content";
import { parseArticleFile } from "@/lib/content/schema";
import { vi } from "vitest";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(fn => fn())); });
async function repository() {
  const temp = await createTemporaryContentRoot(); cleanups.push(temp.cleanup);
  return new LocalDraftRepository({ contentRoot: temp.root });
}
const ref = { category: "anime", filename: "story.mdx" } as const;
describe("draft handoff", () => {
  it("copies only drafts and treats an identical retry as already delivered", async () => {
    const source = await repository(); const target = await repository();
    await source.create(ref, makeValidMdx());
    expect((await syncDrafts(source, target)).created).toEqual([ref]);
    expect((await target.list())).toHaveLength(1);
    expect((await source.list())).toHaveLength(1);
    expect((await syncDrafts(source, target)).unchanged).toEqual([ref]);
  });
  it("preserves editor changes and reports a conflict", async () => {
    const source = await repository(); const target = await repository();
    await source.create(ref, makeValidMdx());
    await target.create(ref, makeValidMdx({ title: "Editor revised title" }));
    expect((await syncDrafts(source, target)).failed).toEqual([{ ref, code: "conflict" }]);
    expect((await target.read(ref)).title).toBe("Editor revised title");
  });
  it("syncs only the drafts selected for the current delivery", async () => {
    const source = await repository(); const target = await repository();
    const currentRef = { category: "sports", filename: "current-story.mdx" } as const;
    await source.create(currentRef, makeValidMdx({
      category: "sports",
      slug: "current-story",
      title: "Current story",
    }));
    await source.create(ref, makeValidMdx());
    await target.create(ref, makeValidMdx({ title: "Editor revised title" }));

    const result = await syncDrafts(source, target, [currentRef]);

    expect(result.created).toEqual([currentRef]);
    expect(result.failed).toEqual([]);
    expect((await target.read(ref)).title).toBe("Editor revised title");
  });
  it("does not recreate an article already published by the editor", async () => {
    const source = await repository(); const target = await repository();
    await source.create(ref, makeValidMdx());
    await target.create(ref, makeValidMdx());
    await target.publish(ref, makeValidMdx());
    expect((await syncDrafts(source, target)).failed).toEqual([{ ref, code: "conflict" }]);
    expect(await target.list()).toEqual([]);
  });
});

function draftDocument(ref: DraftRef, mdx: string): DraftDocument {
  const article = parseArticleFile(mdx, ref.filename);
  return {
    ref,
    title: article.title,
    date: article.date,
    excerpt: article.excerpt,
    category: article.category,
    version: "version-1",
    mdx,
    article,
  };
}

describe("single-draft verified delivery", () => {
  const deliveryRef = { category: "anime", filename: "story.mdx" } as const;
  const mdx = makeValidMdx();
  const source = { read: vi.fn(async () => draftDocument(deliveryRef, mdx)) };
  const missing = () => new DraftRepositoryError("not_found", "Draft was not found");

  it("returns a retryable failure after a network failure before creation", async () => {
    const target = {
      read: vi.fn(async () => { throw missing(); }),
      create: vi.fn(async () => {
        throw new GitDataClientError("storage_unavailable", "GitHub could not be reached", {
          category: "network",
          retryable: true,
        });
      }),
    };
    const sleep = vi.fn(async () => undefined);

    const result = await deliverDraft(source, target, deliveryRef, { sleep });

    expect(result).toMatchObject({ status: "retryableFailure", category: "network", attempts: 3 });
    expect(target.create).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("reconciles a successful create whose response was lost", async () => {
    let remote: string | undefined;
    const target = {
      read: vi.fn(async () => {
        if (!remote) throw missing();
        return draftDocument(deliveryRef, remote);
      }),
      create: vi.fn(async (_ref: DraftRef, bytes: string) => {
        remote = bytes;
        throw new GitDataClientError("storage_unavailable", "GitHub could not be reached", {
          category: "network",
          retryable: true,
        });
      }),
    };

    await expect(deliverDraft(source, target, deliveryRef)).resolves.toMatchObject({
      status: "created",
      attempts: 1,
    });
    expect(target.create).toHaveBeenCalledTimes(1);
  });

  it("reports identical existing bytes as already delivered", async () => {
    const target = {
      read: vi.fn(async () => draftDocument(deliveryRef, mdx)),
      create: vi.fn(),
    };
    await expect(deliverDraft(source, target, deliveryRef)).resolves.toMatchObject({
      status: "alreadyDelivered",
      attempts: 0,
    });
    expect(target.create).not.toHaveBeenCalled();
  });

  it("preserves different existing bytes as a conflict", async () => {
    const different = makeValidMdx({ title: "Editor revised title" });
    const target = {
      read: vi.fn(async () => draftDocument(deliveryRef, different)),
      create: vi.fn(),
    };
    await expect(deliverDraft(source, target, deliveryRef)).resolves.toMatchObject({
      status: "conflict",
      category: "content-conflict",
      attempts: 0,
    });
    expect(target.create).not.toHaveBeenCalled();
  });

  it("requires a person when the slug is already published", async () => {
    const target = {
      read: vi.fn(async () => { throw missing(); }),
      create: vi.fn(async () => {
        throw new DraftRepositoryError("conflict", "A published article with this slug already exists");
      }),
    };
    await expect(deliverDraft(source, target, deliveryRef)).resolves.toMatchObject({
      status: "humanRequired",
      category: "published-conflict",
      attempts: 1,
    });
  });

  it("does not retry authentication failures", async () => {
    const target = {
      read: vi.fn(async () => { throw missing(); }),
      create: vi.fn(async () => {
        throw new GitDataClientError("storage_unavailable", "GitHub authentication failed", {
          category: "authentication",
          retryable: false,
        });
      }),
    };
    await expect(deliverDraft(source, target, deliveryRef)).resolves.toMatchObject({
      status: "humanRequired",
      category: "authentication",
      attempts: 1,
    });
    expect(target.create).toHaveBeenCalledTimes(1);
  });

  it("retries safely when the branch moves before the ref update", async () => {
    let created = false;
    const target = {
      read: vi.fn(async () => {
        if (!created) throw missing();
        return draftDocument(deliveryRef, mdx);
      }),
      create: vi.fn()
        .mockRejectedValueOnce(new DraftRepositoryError("conflict", "GitHub rejected the ref update"))
        .mockImplementationOnce(async () => {
          created = true;
          return draftDocument(deliveryRef, mdx);
        }),
    };
    await expect(
      deliverDraft(source, target, deliveryRef, { sleep: async () => undefined }),
    ).resolves.toMatchObject({ status: "created", attempts: 2 });
    expect(target.create).toHaveBeenCalledTimes(2);
  });
});
