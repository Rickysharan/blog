import { afterEach, describe, expect, it } from "vitest";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import { syncDrafts } from "@/lib/pipeline/sync";
import { createTemporaryContentRoot, makeValidMdx } from "@/tests/helpers/temp-content";

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
  it("does not recreate an article already published by the editor", async () => {
    const source = await repository(); const target = await repository();
    await source.create(ref, makeValidMdx());
    await target.create(ref, makeValidMdx());
    await target.publish(ref, makeValidMdx());
    expect((await syncDrafts(source, target)).failed).toEqual([{ ref, code: "conflict" }]);
    expect(await target.list()).toEqual([]);
  });
});
