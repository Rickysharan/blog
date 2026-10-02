import { z } from "zod";

import { categorySchema } from "./operations";

export const STUDIO_TASK_KINDS = [
  "writing",
  "review",
  "publication",
  "seo",
  "provider",
  "maintenance"
] as const;

export const STUDIO_TASK_STATES = ["open", "completed", "postponed"] as const;
export const PROVIDER_STATES = [
  "connected",
  "delayed",
  "stale",
  "unavailable",
  "disconnected"
] as const;

export const studioTaskKindSchema = z.enum(STUDIO_TASK_KINDS);
export const studioTaskStateSchema = z.enum(STUDIO_TASK_STATES);
export const providerStateSchema = z.enum(PROVIDER_STATES);

const timestampSchema = z.string().datetime({ offset: true });
const dateSchema = z.string().date();

const studioTaskFieldsSchema = z
  .object({
    evidenceKey: z.string().trim().min(1).max(240),
    kind: studioTaskKindSchema,
    title: z.string().trim().min(1).max(180),
    detail: z.string().trim().min(1).max(2_000).nullable().default(null),
    category: categorySchema.nullable().default(null),
    state: studioTaskStateSchema.default("open"),
    priority: z.number().int().min(0).max(100).default(50),
    source: z.string().trim().min(1).max(80),
    postponedUntil: timestampSchema.nullable().default(null),
    completedAt: timestampSchema.nullable().default(null)
  })
  .strict();

function validateStudioTaskTimestamps(
  task: { state: StudioTaskState; completedAt: string | null; postponedUntil: string | null },
  context: z.RefinementCtx
) {
  if (task.state === "completed") {
    if (task.completedAt === null) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Completed tasks require completedAt" });
    }
    if (task.postponedUntil !== null) {
      context.addIssue({ code: "custom", path: ["postponedUntil"], message: "Completed tasks cannot be postponed" });
    }
    return;
  }

  if (task.state === "postponed") {
    if (task.postponedUntil === null) {
      context.addIssue({ code: "custom", path: ["postponedUntil"], message: "Postponed tasks require postponedUntil" });
    }
    if (task.completedAt !== null) {
      context.addIssue({ code: "custom", path: ["completedAt"], message: "Postponed tasks cannot be completed" });
    }
    return;
  }

  if (task.completedAt !== null) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Open tasks cannot be completed" });
  }
  if (task.postponedUntil !== null) {
    context.addIssue({ code: "custom", path: ["postponedUntil"], message: "Open tasks cannot be postponed" });
  }
}

export const studioTaskInputSchema = studioTaskFieldsSchema.superRefine(validateStudioTaskTimestamps);

export const studioTaskSchema = studioTaskFieldsSchema
  .extend({
    id: z.string().uuid(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .superRefine(validateStudioTaskTimestamps);

export const reportRangeSchema = z
  .object({
    start: dateSchema,
    end: dateSchema
  })
  .strict()
  .refine(({ start, end }) => start <= end, "Report range start must not be after its end");

const jsonDataSchema = z
  .unknown()
  .refine((value) => {
    try {
      const serialized = JSON.stringify(value);
      return serialized !== undefined && new TextEncoder().encode(serialized).byteLength <= 500_000;
    } catch {
      return false;
    }
  }, "Report data must be bounded JSON");

export const reportEnvelopeSchema = z
  .object({
    source: z.string().trim().min(1).max(120),
    range: reportRangeSchema,
    fetchedAt: timestampSchema.nullable(),
    state: providerStateSchema,
    data: jsonDataSchema.nullable()
  })
  .strict()
  .superRefine((report, context) => {
    const hasSuccessfulReport = report.state === "connected" || report.state === "delayed" || report.state === "stale";
    if (hasSuccessfulReport && (report.fetchedAt === null || report.data === null)) {
      context.addIssue({
        code: "custom",
        message: `${report.state} reports require timestamped data`
      });
    }
    if (!hasSuccessfulReport && report.data !== null) {
      context.addIssue({
        code: "custom",
        message: `${report.state} reports must not invent data`
      });
    }
  });

export type StudioTaskKind = z.infer<typeof studioTaskKindSchema>;
export type StudioTaskState = z.infer<typeof studioTaskStateSchema>;
export type StudioTaskInput = z.input<typeof studioTaskInputSchema>;
export type StudioTask = z.infer<typeof studioTaskSchema>;
export type ProviderState = z.infer<typeof providerStateSchema>;
export type ReportRange = z.infer<typeof reportRangeSchema>;
export type ReportEnvelope<T> = Omit<z.infer<typeof reportEnvelopeSchema>, "data"> & { data: T | null };
