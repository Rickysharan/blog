import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireWriterLock,
  ensureLocalModel,
  LocalRuntimeError,
} from "@/lib/pipeline/local-runtime";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function lockFixture(metadata: unknown) {
  const directory = await mkdtemp(path.join(tmpdir(), "omnilede-lock-"));
  cleanups.push(() => rm(directory, { force: true, recursive: true }));
  const lockPath = path.join(directory, "local-writer.lock");
  await writeFile(lockPath, `${JSON.stringify(metadata)}\n`, "utf8");
  return lockPath;
}

describe("owned local writer lock", () => {
  it("rejects a live lock with a matching process identity", async () => {
    const lockPath = await lockFixture({ version: 1, pid: 412, processIdentity: "born-at-10" });

    await expect(
      acquireWriterLock({
        lockPath,
        pid: 900,
        processIdentity: "born-at-11",
        inspectProcess: async () => "born-at-10",
      }),
    ).rejects.toMatchObject({ category: "already-running" } satisfies Partial<LocalRuntimeError>);
    await expect(readFile(lockPath, "utf8")).resolves.toContain('"pid":412');
  });

  it("replaces a lock whose process is dead", async () => {
    const lockPath = await lockFixture({ version: 1, pid: 412, processIdentity: "born-at-10" });
    const lock = await acquireWriterLock({
      lockPath,
      pid: 900,
      processIdentity: "born-at-11",
      inspectProcess: async () => null,
    });

    expect(lock.repairs).toEqual(["Removed a stale local writer lock"]);
    await expect(readFile(lockPath, "utf8")).resolves.toContain('"pid":900');
    await lock.release();
    await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replaces a lock when the operating system reused its PID", async () => {
    const lockPath = await lockFixture({ version: 1, pid: 412, processIdentity: "born-at-10" });
    const lock = await acquireWriterLock({
      lockPath,
      pid: 900,
      processIdentity: "born-at-11",
      inspectProcess: async () => "born-at-12",
    });

    expect(lock.repairs).toEqual(["Removed a stale local writer lock"]);
    await lock.release();
  });

  it("preserves malformed lock metadata because ownership cannot be proved", async () => {
    const lockPath = await lockFixture({ pid: "not-a-process" });

    await expect(
      acquireWriterLock({
        lockPath,
        pid: 900,
        processIdentity: "born-at-11",
        inspectProcess: async () => null,
      }),
    ).rejects.toMatchObject({ category: "unknown" } satisfies Partial<LocalRuntimeError>);
    await expect(readFile(lockPath, "utf8")).resolves.toContain("not-a-process");
  });

  it("preserves a lock when operating-system process inspection fails", async () => {
    const lockPath = await lockFixture({ version: 1, pid: 412, processIdentity: "born-at-10" });
    await expect(acquireWriterLock({
      lockPath,
      pid: 900,
      processIdentity: "born-at-11",
      inspectProcess: async () => { throw new Error("ps unavailable"); },
    })).rejects.toMatchObject({ category: "unknown" } satisfies Partial<LocalRuntimeError>);
    await expect(readFile(lockPath, "utf8")).resolves.toContain('"pid":412');
  });

  it("serializes simultaneous reclamation of one stale lock", async () => {
    const lockPath = await lockFixture({ version: 1, pid: 412, processIdentity: "born-at-10" });
    const identities = new Map([[900, "born-at-11"], [901, "born-at-12"]]);
    const inspectProcess = async (pid: number) => pid === 412 ? null : identities.get(pid) ?? null;
    const results = await Promise.allSettled([
      acquireWriterLock({ lockPath, pid: 900, processIdentity: "born-at-11", inspectProcess }),
      acquireWriterLock({ lockPath, pid: 901, processIdentity: "born-at-12", inspectProcess }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejection.reason).toMatchObject({ category: "already-running" });
    const winner = results.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof acquireWriterLock>>>;
    await winner.value.release();
  });
});

describe("local Ollama repair", () => {
  it("accepts a healthy installed model without restarting Ollama", async () => {
    const startOllama = vi.fn();
    const result = await ensureLocalModel({
      model: "qwen2.5:7b",
      readModels: async () => ["qwen2.5:7b"],
      startOllama,
      wait: async () => undefined,
    });

    expect(result).toEqual({ ok: true, repairs: [] });
    expect(startOllama).not.toHaveBeenCalled();
  });

  it("repairs an unavailable Ollama server with one local restart", async () => {
    const readModels = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(["qwen2.5:7b"]);
    const startOllama = vi.fn(async () => undefined);

    const result = await ensureLocalModel({
      model: "qwen2.5:7b",
      readModels,
      startOllama,
      wait: async () => undefined,
    });

    expect(result).toEqual({
      ok: true,
      repairs: ["Ollama stopped; restarted locally (1/2)"],
    });
    expect(startOllama).toHaveBeenCalledTimes(1);
    expect(startOllama).toHaveBeenCalledWith({
      env: expect.objectContaining({ OLLAMA_HOST: "127.0.0.1:11434", OLLAMA_NO_CLOUD: "1" }),
    });
  });

  it("stops after two failed local restart attempts", async () => {
    const startOllama = vi.fn(async () => undefined);
    const result = await ensureLocalModel({
      model: "qwen2.5:7b",
      readModels: async () => {
        throw new Error("connection refused with private details");
      },
      startOllama,
      wait: async () => undefined,
    });

    expect(result).toEqual({
      ok: false,
      category: "local-model-unavailable",
      message: "Ollama could not be started locally after two repair attempts.",
      repairs: [
        "Ollama stopped; restarted locally (1/2)",
        "Ollama stopped; restarted locally (2/2)",
      ],
    });
    expect(startOllama).toHaveBeenCalledTimes(2);
  });

  it("reports a missing model without downloading or restarting anything", async () => {
    const startOllama = vi.fn();
    const result = await ensureLocalModel({
      model: "qwen2.5:7b",
      readModels: async () => ["llama3.2:latest"],
      startOllama,
      wait: async () => undefined,
    });

    expect(result).toEqual({
      ok: false,
      category: "local-model-missing",
      message: "The configured local model is not installed. Install qwen2.5:7b in Ollama, then try again.",
      repairs: [],
    });
    expect(startOllama).not.toHaveBeenCalled();
  });
});
