import { promises as fs } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DraftRepositoryError } from "@/lib/drafts/types";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import {
  createTemporaryContentRoot,
  makeValidMdx,
} from "@/tests/helpers/temp-content";

describe("LocalDraftRepository", () => {
  let contentRoot: string;
  let cleanup: () => Promise<void>;
  const ref = { category: "anime", filename: "story.mdx" } as const;

  beforeEach(async () => {
    const temporary = await createTemporaryContentRoot();
    contentRoot = temporary.root;
    cleanup = temporary.cleanup;
    await fs.mkdir(path.join(contentRoot, "drafts", "anime"), { recursive: true });
    await fs.writeFile(
      path.join(contentRoot, "drafts", "anime", "story.mdx"),
      makeValidMdx(),
    );
  });

  afterEach(async () => cleanup());

  it("lists and reads validated drafts with a stable content version", async () => {
    const repository = new LocalDraftRepository({ contentRoot });
    const listed = await repository.list();
    const read = await repository.read(ref);

    expect(listed).toEqual([
      expect.objectContaining({ ref, title: "A Valid Editorial Draft" }),
    ]);
    expect(read.mdx).toContain("## Why it matters");
    expect(read.version).toMatch(/^[a-f0-9]{64}$/);
    expect(listed[0]?.version).toBe(read.version);
  });

  it("publishes by moving a valid draft and removing the source", async () => {
    const repository = new LocalDraftRepository({ contentRoot });
    const draft = await repository.read(ref);
    const result = await repository.publish(ref, draft.mdx, draft.version);

    await expect(fs.access(result.articlePath)).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(contentRoot, "drafts", "anime", "story.mdx")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects stale versions and never overwrites a published article", async () => {
    const repository = new LocalDraftRepository({ contentRoot });
    await expect(repository.save(ref, makeValidMdx(), "stale-version")).rejects.toBeInstanceOf(
      DraftRepositoryError,
    );

    const articleDirectory = path.join(contentRoot, "articles", "anime");
    await fs.mkdir(articleDirectory, { recursive: true });
    await fs.writeFile(path.join(articleDirectory, "story.mdx"), makeValidMdx());
    await expect(repository.publish(ref, makeValidMdx())).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("discards only the expected draft version", async () => {
    const repository = new LocalDraftRepository({ contentRoot });
    const draft = await repository.read(ref);
    await repository.discard(ref, draft.version);

    await expect(repository.read(ref)).rejects.toMatchObject({ code: "not_found" });
  });
});
