import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalRunState } from "@/lib/pipeline/local-run-types";
import {
  archiveInvalidRunState,
  loadRunState,
  saveRunState,
} from "@/lib/pipeline/run-state";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "omnilede-run-state-"));
  cleanups.push(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

const state: LocalRunState = {
  version: 1,
  runId: "run-2026-09-30-001",
  status: "running",
  stage: "generation",
  attempt: 2,
  percent: 34,
  message: "Correcting the local draft",
  draftRef: { category: "sports", filename: "team-update.mdx" },
  imageCount: 0,
  repairs: ["Ollama restarted locally"],
  deliveryStatus: "pending",
  startedAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:01:00.000Z",
};

describe("local writer run state", () => {
  it("round-trips non-secret resumable state atomically", async () => {
    const directory = await temporaryDirectory();
    const statePath = path.join(directory, "current-run.json");

    await saveRunState(statePath, state);

    await expect(loadRunState(statePath)).resolves.toEqual(state);
    await expect(readFile(statePath, "utf8")).resolves.toContain(
      '"runId": "run-2026-09-30-001"',
    );
  });

  it("keeps the prior valid file when replacement fails", async () => {
    const directory = await temporaryDirectory();
    const statePath = path.join(directory, "current-run.json");
    await saveRunState(statePath, state);
    const priorBytes = await readFile(statePath, "utf8");

    await expect(
      saveRunState(
        statePath,
        { ...state, stage: "image-selection", percent: 58 },
        {
          rename: async () => {
            throw new Error("simulated interrupted replacement");
          },
        },
      ),
    ).rejects.toThrow("simulated interrupted replacement");

    await expect(readFile(statePath, "utf8")).resolves.toBe(priorBytes);
    await expect(loadRunState(statePath)).resolves.toEqual(state);
  });

  it("rejects secrets and malformed stage data", async () => {
    const directory = await temporaryDirectory();
    const statePath = path.join(directory, "current-run.json");

    await expect(
      saveRunState(statePath, {
        ...state,
        diagnostics: { githubToken: "github_pat_examplecredential" },
      } as LocalRunState),
    ).rejects.toThrow(/credential|secret/i);

    await writeFile(
      statePath,
      JSON.stringify({ ...state, stage: "upload-everything" }),
      "utf8",
    );
    await expect(loadRunState(statePath)).rejects.toThrow(/stage/i);
  });

  it("archives malformed state without deleting drafts", async () => {
    const directory = await temporaryDirectory();
    const statePath = path.join(directory, ".audit", "current-run.json");
    const draftPath = path.join(directory, "content", "drafts", "sports", "safe.mdx");
    await import("node:fs/promises").then(({ mkdir }) =>
      Promise.all([
        mkdir(path.dirname(statePath), { recursive: true }),
        mkdir(path.dirname(draftPath), { recursive: true }),
      ]),
    );
    await writeFile(statePath, "{ definitely not json", "utf8");
    await writeFile(draftPath, "preserve this draft", "utf8");

    const archivedPath = await archiveInvalidRunState(
      statePath,
      new Date("2026-09-30T10:02:03.000Z"),
    );

    expect(archivedPath).toBe(
      path.join(directory, ".audit", "current-run.invalid-20260930T100203000Z.json"),
    );
    await expect(readFile(archivedPath!, "utf8")).resolves.toBe(
      "{ definitely not json",
    );
    await expect(readFile(draftPath, "utf8")).resolves.toBe("preserve this draft");
    await expect(loadRunState(statePath)).resolves.toBeNull();
  });
});
