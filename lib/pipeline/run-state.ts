import {
  mkdir,
  readFile,
  rename as renameFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  LOCAL_RUN_STAGES,
  RECOVERY_CATEGORIES,
  type LocalRunState,
} from "@/lib/pipeline/local-run-types";

const draftRefSchema = z
  .object({ category: z.string().min(1), filename: z.string().min(1) })
  .strict();

const selectedStorySchema = z
  .object({
    title: z.string().min(1),
    source: z.string().min(1),
    sourceUrl: z.string().url(),
    date: z.string().min(1),
    snippet: z.string(),
    category: z.string().min(1),
  })
  .strict();

const generatedDraftSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  body: z.string().min(1),
}).strict();

const runStateSchema: z.ZodType<LocalRunState> = z
  .object({
    version: z.literal(1),
    runId: z.string().min(1),
    status: z.enum(["running", "completed", "human-required", "cancelled"]),
    stage: z.enum(LOCAL_RUN_STAGES),
    attempt: z.number().int().min(1).max(3),
    percent: z.number().min(0).max(100),
    message: z.string(),
    draftRef: draftRefSchema.optional(),
    draftHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    imageCount: z.number().int().min(0).max(3),
    repairs: z.array(z.string()),
    errorCategory: z.enum(RECOVERY_CATEGORIES).optional(),
    deliveryStatus: z.enum(["pending", "delivered", "not-delivered"]),
    selectedStory: selectedStorySchema.optional(),
    generatedDraft: generatedDraftSchema.optional(),
    startedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const credentialKey = /(?:authorization|cookie|credential|password|secret|token|api[_-]?key)/i;
const credentialValue = /(?:^bearer\s+|github_pat_|gh[pousr]_[A-Za-z0-9]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

function assertContainsNoCredentials(value: unknown, key = "state"): void {
  if (credentialKey.test(key)) {
    throw new Error(`Run state cannot contain credential field: ${key}`);
  }
  if (typeof value === "string" && credentialValue.test(value)) {
    throw new Error("Run state cannot contain secret credential values");
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertContainsNoCredentials(item, key));
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      assertContainsNoCredentials(childValue, childKey);
    }
  }
}

export async function loadRunState(statePath: string): Promise<LocalRunState | null> {
  let raw: string;
  try {
    raw = await readFile(statePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Run state is malformed JSON");
  }
  assertContainsNoCredentials(value);
  const parsed = runStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Run state has malformed stage data: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

interface SaveRunStateOptions {
  rename?: typeof renameFile;
}

export async function saveRunState(
  statePath: string,
  state: LocalRunState,
  options: SaveRunStateOptions = {},
): Promise<void> {
  assertContainsNoCredentials(state);
  const parsed = runStateSchema.parse(state);
  const directory = path.dirname(statePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(statePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await (options.rename ?? renameFile)(temporaryPath, statePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function archiveInvalidRunState(
  statePath: string,
  now = new Date(),
): Promise<string | null> {
  try {
    await readFile(statePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const stamp = now.toISOString().replace(/[-:.]/g, "");
  const extension = path.extname(statePath) || ".json";
  const base = path.basename(statePath, extension);
  const archivedPath = path.join(
    path.dirname(statePath),
    `${base}.invalid-${stamp}${extension}`,
  );
  await renameFile(statePath, archivedPath);
  return archivedPath;
}
