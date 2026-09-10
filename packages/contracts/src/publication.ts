import { z } from "zod";

import { bcp47LanguageSchema, editorDocumentSchema } from "./content";
import { categorySchema, regionSchema } from "./operations";

export const articleSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);

export const publicationDateSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
      message: "date must be a real calendar date",
    }),
);

export const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "must use HTTPS",
  });

export const boundedHttpsUrlSchema = httpsUrlSchema.max(2_048);

export const articleTagsSchema = z
  .array(z.string().trim().min(1).max(50))
  .min(1)
  .max(12);

export const publicationPayloadSchema = z
  .object({
    publicationId: z.string().uuid(),
    submissionId: z.string().uuid(),
    submissionVersion: z.number().int().positive().safe(),
    title: z.string().trim().min(1).max(180),
    slug: articleSlugSchema,
    date: publicationDateSchema,
    category: categorySchema,
    tags: articleTagsSchema,
    contributorId: z.string().uuid(),
    contributorName: z.string().trim().min(1).max(100),
    excerpt: z.string().trim().min(1).max(320),
    coverImage: boundedHttpsUrlSchema,
    readTime: z.number().int().positive().max(120),
    sourceName: z.string().trim().min(1).max(120),
    sourceUrl: boundedHttpsUrlSchema,
    region: regionSchema,
    language: bcp47LanguageSchema,
    contentDocument: editorDocumentSchema,
    guidelinesVersion: z.string().trim().min(1).max(64),
  })
  .strict();

export type PublicationPayload = z.infer<typeof publicationPayloadSchema>;
