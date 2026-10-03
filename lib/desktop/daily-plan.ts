import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_SLUGS,
  type CategorySlug,
} from "@/lib/config/categories";
import {
  loadEditorialInventory,
  type EditorialInventory,
  type EditorialInventoryItem,
} from "@/lib/desktop/content-inventory";
import type { DraftRef } from "@/lib/drafts/types";
import type { LocalRunResult } from "@/lib/pipeline/local-run-types";
import type { LocalRunState } from "@/lib/pipeline/local-run-types";
import { loadRunState } from "@/lib/pipeline/run-state";
import type { FetchLike } from "@/lib/pipeline/types";

export type DailyTaskStatus =
  | "todo"
  | "writing"
  | "draft-ready"
  | "published"
  | "needs-attention";

export interface DailyPlanTaskSnapshot {
  category: CategorySlug;
  label: string;
  reason: string;
  status: DailyTaskStatus;
  draftRef?: DraftRef;
}

export interface DailyPlanSnapshot {
  date: string;
  completedCount: number;
  totalTasks: 3;
  draftCount: number;
  publishedCount: number;
  tasks: [DailyPlanTaskSnapshot, DailyPlanTaskSnapshot, DailyPlanTaskSnapshot];
}

export interface PlannerInput {
  contentRoot: string;
  auditRoot: string;
  env: Record<string, string | undefined>;
  date?: string;
  now?: Date;
  fetchImpl?: FetchLike;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
  "Expected a real YYYY-MM-DD date",
);
const categorySchema = z.enum(CATEGORY_SLUGS);
const draftRefSchema = z.object({
  category: categorySchema,
  filename: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/),
}).strict();
const storedTaskSchema = z.object({
  category: categorySchema,
  selectedAt: z.iso.datetime(),
  reason: z.string().min(1).max(160),
  runId: z.string().min(1).optional(),
  draftRef: draftRefSchema.optional(),
  outcome: z.enum(["todo", "running", "completed", "attention", "cancelled"]).default("todo"),
}).strict().refine(
  (task) => task.draftRef === undefined || task.draftRef.category === task.category,
  "Draft category must match its daily task",
);
const dailyPlanSchema = z.object({
  version: z.literal(1),
  date: dateSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  tasks: z.array(storedTaskSchema).length(3).refine(
    (tasks) => new Set(tasks.map((task) => task.category)).size === tasks.length,
    "Daily plan categories must be unique",
  ),
}).strict();

type StoredTask = z.infer<typeof storedTaskSchema>;
type DailyPlan = z.infer<typeof dailyPlanSchema>;

export type DailyPlanV1 = Readonly<DailyPlan>;

interface ResumableRun {
  category: CategorySlug;
  state: LocalRunState;
}

function localDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function requestedDate(input: PlannerInput): string {
  return dateSchema.parse(input.date ?? localDate(input.now ?? new Date()));
}

function planPath(auditRoot: string, date: string): string {
  return path.join(auditRoot, "daily-plans", `${date}.json`);
}

async function readPlan(pathname: string): Promise<DailyPlan | null> {
  let bytes: string;
  try {
    bytes = await readFile(pathname, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return dailyPlanSchema.parse(JSON.parse(bytes));
  } catch {
    throw new Error("Daily plan is malformed; its saved file was preserved.");
  }
}

/** Reads the existing local writer plan without reconciling or rewriting its file. */
export async function readDailyPlanV1(input: { auditRoot: string; date: string }): Promise<DailyPlanV1 | null> {
  const date = dateSchema.parse(input.date);
  return readPlan(planPath(input.auditRoot, date));
}

async function savePlan(pathname: string, plan: DailyPlan): Promise<void> {
  const parsed = dailyPlanSchema.parse(plan);
  await mkdir(path.dirname(pathname), { recursive: true });
  const temporary = path.join(
    path.dirname(pathname),
    `.${path.basename(pathname)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    await rename(temporary, pathname);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function publishedFor(inventory: EditorialInventory, category: CategorySlug): EditorialInventoryItem[] {
  return inventory.items.filter((item) => item.kind === "published" && item.category === category);
}

function newestDraft(inventory: EditorialInventory, category: CategorySlug): EditorialInventoryItem | undefined {
  return inventory.items
    .filter((item) => item.kind === "draft" && item.category === category)
    .sort((left, right) => right.date.localeCompare(left.date) || left.filename.localeCompare(right.filename))[0];
}

function rankedCategories(inventory: EditorialInventory): CategorySlug[] {
  return [...CATEGORY_SLUGS].sort((left, right) => {
    const leftPublished = publishedFor(inventory, left);
    const rightPublished = publishedFor(inventory, right);
    const leftLatest = leftPublished.map((item) => item.date).sort().at(-1);
    const rightLatest = rightPublished.map((item) => item.date).sort().at(-1);
    if (leftLatest === undefined && rightLatest !== undefined) return -1;
    if (leftLatest !== undefined && rightLatest === undefined) return 1;
    if (leftLatest !== rightLatest) return (leftLatest ?? "").localeCompare(rightLatest ?? "");
    if (leftPublished.length !== rightPublished.length) return leftPublished.length - rightPublished.length;
    return CATEGORY_SLUGS.indexOf(left) - CATEGORY_SLUGS.indexOf(right);
  });
}

function selectionReason(inventory: EditorialInventory, category: CategorySlug): string {
  if (newestDraft(inventory, category)) return "Draft waiting for review";
  const newest = publishedFor(inventory, category).map((item) => item.date).sort().at(-1);
  return newest ? `Least recent coverage · last published ${newest.slice(0, 10)}` : "No published article yet";
}

function createTask(
  inventory: EditorialInventory,
  category: CategorySlug,
  selectedAt: string,
  resumable?: ResumableRun,
): StoredTask {
  const draft = newestDraft(inventory, category);
  const savedDraft = resumable?.category === category
    ? draftRefSchema.safeParse(resumable.state.draftRef)
    : undefined;
  const savedOutcome = resumable?.category === category
    ? resumable.state.status === "running" ? "running" : "attention"
    : "todo";
  return {
    category,
    selectedAt,
    reason: resumable?.category === category
      ? resumable.state.status === "running"
        ? "Saved article is still being written"
        : "Saved article needs attention"
      : selectionReason(inventory, category),
    outcome: savedOutcome,
    ...(resumable?.category === category ? { runId: resumable.state.runId } : {}),
    ...(savedDraft?.success
      ? { draftRef: savedDraft.data }
      : draft ? { draftRef: { category, filename: draft.filename } } : {}),
  };
}

async function loadResumableRun(auditRoot: string): Promise<ResumableRun | null> {
  const state = await loadRunState(path.join(auditRoot, "current-run.json"));
  if (!state || state.status === "completed") return null;
  const candidate = state.requestedCategory ?? state.selectedStory?.category ?? state.draftRef?.category;
  const category = categorySchema.safeParse(candidate);
  if (!category.success) {
    throw new Error("The saved writer run has no supported category; its state was preserved.");
  }
  return { category: category.data, state };
}

function reconcileResumableTask(plan: DailyPlan, resumable: ResumableRun | null): DailyPlan {
  if (!resumable) return plan;
  const task = plan.tasks.find((candidate) => candidate.category === resumable.category);
  if (!task) return plan;
  task.runId = resumable.state.runId;
  task.outcome = resumable.state.status === "running" ? "running" : "attention";
  task.reason = resumable.state.status === "running"
    ? "Saved article is still being written"
    : "Saved article needs attention";
  const draftRef = draftRefSchema.safeParse(resumable.state.draftRef);
  if (draftRef.success) task.draftRef = draftRef.data;
  return plan;
}

async function loadOrCreatePlan(
  input: PlannerInput,
  inventory: EditorialInventory,
  resumable: ResumableRun | null,
): Promise<DailyPlan> {
  const date = requestedDate(input);
  const pathname = planPath(input.auditRoot, date);
  const existing = await readPlan(pathname);
  if (existing) return reconcileResumableTask(existing, resumable);
  const timestamp = (input.now ?? new Date()).toISOString();
  const ranked = rankedCategories(inventory);
  const categories = resumable
    ? [resumable.category, ...ranked.filter((category) => category !== resumable.category)].slice(0, 3)
    : ranked.slice(0, 3);
  const plan = dailyPlanSchema.parse({
    version: 1,
    date,
    createdAt: timestamp,
    updatedAt: timestamp,
    tasks: categories.map((category) => createTask(inventory, category, timestamp, resumable ?? undefined)),
  });
  await savePlan(pathname, plan);
  return plan;
}

function exactItem(
  inventory: EditorialInventory,
  ref: DraftRef,
  kind: "draft" | "published",
): EditorialInventoryItem | undefined {
  return inventory.items.find((item) =>
    item.kind === kind && item.category === ref.category && item.filename === ref.filename);
}

function taskStatus(task: StoredTask, inventory: EditorialInventory): DailyTaskStatus {
  if (task.draftRef && exactItem(inventory, task.draftRef, "published")) return "published";
  if (task.outcome === "running") return "writing";
  if (["attention", "cancelled"].includes(task.outcome)) return "needs-attention";
  if (task.draftRef && exactItem(inventory, task.draftRef, "draft")) return "draft-ready";
  if (task.outcome === "completed") return "needs-attention";
  return "todo";
}

function snapshot(plan: DailyPlan, inventory: EditorialInventory): DailyPlanSnapshot {
  const tasks = plan.tasks.map((task) => {
    const definition = CATEGORIES.find((category) => category.slug === task.category)!;
    return {
      category: task.category,
      label: definition.label,
      reason: task.reason,
      status: taskStatus(task, inventory),
      ...(task.draftRef ? { draftRef: task.draftRef } : {}),
    };
  }) as DailyPlanSnapshot["tasks"];
  return {
    date: plan.date,
    completedCount: tasks.filter((task) => task.status === "draft-ready" || task.status === "published").length,
    totalTasks: 3,
    draftCount: inventory.items.filter((item) => item.kind === "draft").length,
    publishedCount: inventory.items.filter((item) => item.kind === "published").length,
    tasks,
  };
}

async function inventoryFor(input: PlannerInput): Promise<EditorialInventory> {
  return loadEditorialInventory({
    contentRoot: input.contentRoot,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
}

export async function getDailyPlanSnapshot(input: PlannerInput): Promise<DailyPlanSnapshot> {
  const inventory = await inventoryFor(input);
  const resumable = await loadResumableRun(input.auditRoot);
  return snapshot(await loadOrCreatePlan(input, inventory, resumable), inventory);
}

export async function replaceDailyPlanTask(
  input: PlannerInput & { category: CategorySlug },
): Promise<DailyPlanSnapshot> {
  const inventory = await inventoryFor(input);
  const resumable = await loadResumableRun(input.auditRoot);
  const plan = await loadOrCreatePlan(input, inventory, resumable);
  const index = plan.tasks.findIndex((task) => task.category === input.category);
  if (index < 0) throw new Error("That category is not in today's plan.");
  if (taskStatus(plan.tasks[index]!, inventory) !== "todo") {
    throw new Error("A started or completed task cannot be replaced.");
  }
  const planned = new Set(plan.tasks.map((task) => task.category));
  const replacement = rankedCategories(inventory).find((category) => !planned.has(category));
  if (!replacement) throw new Error("No other category is available for today's plan.");
  const timestamp = (input.now ?? new Date()).toISOString();
  plan.tasks[index] = createTask(inventory, replacement, timestamp);
  plan.updatedAt = timestamp;
  await savePlan(planPath(input.auditRoot, plan.date), plan);
  return snapshot(plan, inventory);
}

export async function recordDailyPlanRun(input: {
  auditRoot: string;
  date: string;
  category: CategorySlug;
  result: LocalRunResult;
  now?: Date;
}): Promise<void> {
  const date = dateSchema.parse(input.date);
  const pathname = planPath(input.auditRoot, date);
  const plan = await readPlan(pathname);
  if (!plan) throw new Error("Today's daily plan was not found.");
  const task = plan.tasks.find((candidate) => candidate.category === input.category);
  if (!task) throw new Error("The writer category is not in today's plan.");
  task.runId = input.result.runId;
  if (input.result.draftRef) {
    task.draftRef = draftRefSchema.parse(input.result.draftRef);
  }
  task.outcome = input.result.status === "completed"
    ? "completed"
    : input.result.status === "cancelled"
      ? "cancelled"
      : "attention";
  plan.updatedAt = (input.now ?? new Date()).toISOString();
  await savePlan(pathname, plan);
}
