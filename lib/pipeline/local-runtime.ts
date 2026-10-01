import { execFile as execFileCallback, spawn } from "node:child_process";
import { open, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import type { RecoveryCategory } from "@/lib/pipeline/local-run-types";

const execFile = promisify(execFileCallback);

const lockMetadataSchema = z
  .object({
    version: z.literal(1),
    pid: z.number().int().positive(),
    processIdentity: z.string().min(1),
  })
  .strict();

type LockMetadata = z.infer<typeof lockMetadataSchema>;

export class LocalRuntimeError extends Error {
  constructor(
    message: string,
    readonly category: RecoveryCategory,
  ) {
    super(message);
    this.name = "LocalRuntimeError";
  }
}

export interface WriterLock {
  repairs: string[];
  release(): Promise<void>;
}

interface AcquireWriterLockOptions {
  lockPath: string;
  pid?: number;
  processIdentity?: string;
  inspectProcess?: (pid: number) => Promise<string | null>;
}

async function inspectProcessIdentity(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFile("ps", ["-o", "lstart=", "-p", String(pid)]);
    const identity = stdout.trim();
    return identity || null;
  } catch {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return null;
    }
    throw new LocalRuntimeError("The writer process could not be inspected safely.", "unknown");
  }
}

async function readLock(lockPath: string): Promise<LockMetadata> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    throw new LocalRuntimeError(
      "The local writer lock is malformed. Remove it only after confirming no writer is running.",
      "unknown",
    );
  }
  const parsed = lockMetadataSchema.safeParse(value);
  if (!parsed.success) {
    throw new LocalRuntimeError(
      "The local writer lock is malformed. Remove it only after confirming no writer is running.",
      "unknown",
    );
  }
  return parsed.data;
}

export async function acquireWriterLock(
  options: AcquireWriterLockOptions,
): Promise<WriterLock> {
  const pid = options.pid ?? process.pid;
  const inspectProcess = options.inspectProcess ?? inspectProcessIdentity;
  const processIdentity =
    options.processIdentity ?? (await inspectProcess(pid)) ?? `pid-${pid}-unknown-start`;
  const ownMetadata: LockMetadata = { version: 1, pid, processIdentity };
  const repairs: string[] = [];
  const reclaimPath = `${options.lockPath}.reclaim`;

  for (let acquisitionAttempt = 0; acquisitionAttempt < 50; acquisitionAttempt += 1) {
    let guard;
    try {
      guard = await open(reclaimPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }
    try {
      try {
        const handle = await open(options.lockPath, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify(ownMetadata)}\n`, "utf8");
        await handle.close();
        return {
          repairs,
          async release() {
            try {
              const current = await readLock(options.lockPath);
              if (
                current.pid === ownMetadata.pid &&
                current.processIdentity === ownMetadata.processIdentity
              ) {
                await rm(options.lockPath, { force: true });
              }
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
          },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }

      const recorded = await readLock(options.lockPath);
      let liveIdentity: string | null;
      try {
        liveIdentity = await inspectProcess(recorded.pid);
      } catch {
        throw new LocalRuntimeError("The existing writer process could not be inspected safely.", "unknown");
      }
      if (liveIdentity === recorded.processIdentity) {
        throw new LocalRuntimeError("Another local writer is already running.", "already-running");
      }
      await rm(options.lockPath, { force: true });
      repairs.push("Removed a stale local writer lock");
    } finally {
      await guard.close();
      await rm(reclaimPath, { force: true });
    }
  }
  throw new LocalRuntimeError("The local writer lock is busy during recovery.", "already-running");
}

export type RuntimeCheckResult =
  | { ok: true; repairs: string[] }
  | {
      ok: false;
      category: "local-model-missing" | "local-model-unavailable";
      message: string;
      repairs: string[];
    };

interface EnsureLocalModelOptions {
  model: string;
  readModels?: () => Promise<string[]>;
  startOllama?: (options: { env: NodeJS.ProcessEnv }) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
  healthChecksPerRestart?: number;
}

async function defaultReadModels(): Promise<string[]> {
  const response = await fetch("http://127.0.0.1:11434/api/tags", {
    redirect: "error",
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error("Ollama health request failed");
  const body = (await response.json()) as { models?: Array<{ name?: string }> };
  return body.models?.flatMap((entry) => (entry.name ? [entry.name] : [])) ?? [];
}

async function defaultStartOllama({ env }: { env: NodeJS.ProcessEnv }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      env,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function modelIsInstalled(models: string[], model: string): boolean {
  return models.some((installed) => installed === model || installed === `${model}:latest`);
}

export async function ensureLocalModel(
  options: EnsureLocalModelOptions,
): Promise<RuntimeCheckResult> {
  const model = options.model.trim();
  if (!model || /cloud/i.test(model)) {
    return {
      ok: false,
      category: "local-model-missing",
      message: "Choose an installed local Ollama model, then try again.",
      repairs: [],
    };
  }
  const readModels = options.readModels ?? defaultReadModels;
  const startOllama = options.startOllama ?? defaultStartOllama;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const healthChecks = options.healthChecksPerRestart ?? 20;

  try {
    const installed = await readModels();
    if (!modelIsInstalled(installed, model)) {
      return {
        ok: false,
        category: "local-model-missing",
        message: `The configured local model is not installed. Install ${model} in Ollama, then try again.`,
        repairs: [],
      };
    }
    return { ok: true, repairs: [] };
  } catch {
    // A stopped local server is repairable below.
  }

  const repairs: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    repairs.push(`Ollama stopped; restarted locally (${attempt}/2)`);
    try {
      await startOllama({
        env: {
          ...process.env,
          OLLAMA_HOST: "127.0.0.1:11434",
          OLLAMA_NO_CLOUD: "1",
        },
      });
    } catch {
      continue;
    }

    for (let check = 0; check < healthChecks; check += 1) {
      await wait(250);
      try {
        const installed = await readModels();
        if (!modelIsInstalled(installed, model)) {
          return {
            ok: false,
            category: "local-model-missing",
            message: `The configured local model is not installed. Install ${model} in Ollama, then try again.`,
            repairs,
          };
        }
        return { ok: true, repairs };
      } catch {
        // Poll until this bounded start attempt is exhausted.
      }
    }
  }

  return {
    ok: false,
    category: "local-model-unavailable",
    message: "Ollama could not be started locally after two repair attempts.",
    repairs,
  };
}
