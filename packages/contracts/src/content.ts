import { z } from "zod";

import { categorySchema, regionSchema } from "./operations";

const MAX_DOCUMENT_BLOCKS = 100;
const MAX_INLINE_NODES = 200;
const MAX_LIST_ITEMS = 100;
const MAX_BLOCKS_PER_CONTAINER = 100;
const MAX_DOCUMENT_NESTING_DEPTH = 12;
const MAX_LINK_URL_LENGTH = 2_048;

export type EditorLinkMark = {
  type: "link";
  attrs: {
    href: string;
    rel: "nofollow noopener noreferrer";
    target?: "_blank" | null;
    class?: "" | null;
    title?: string | null;
  };
};

export type EditorMark = { type: "bold" } | { type: "italic" } | EditorLinkMark;

export type EditorTextNode = {
  type: "text";
  text: string;
  marks?: EditorMark[];
};

export type EditorHardBreakNode = { type: "hard_break" };
export type EditorInlineNode = EditorTextNode | EditorHardBreakNode;

export type EditorParagraphNode = {
  type: "paragraph";
  content: EditorInlineNode[];
};

export type EditorHeadingNode = {
  type: "heading";
  attrs: { level: 2 | 3 };
  content: EditorTextNode[];
};

export type EditorListItemNode = {
  type: "list_item";
  content: EditorBlockNode[];
};

export type EditorListNode = {
  type: "bullet_list" | "ordered_list";
  content: EditorListItemNode[];
};

export type EditorBlockquoteNode = {
  type: "blockquote";
  content: (EditorParagraphNode | EditorHeadingNode | EditorListNode)[];
};

export type EditorBlockNode =
  | EditorParagraphNode
  | EditorHeadingNode
  | EditorListNode
  | EditorBlockquoteNode;

export type EditorNode = EditorInlineNode | EditorBlockNode | EditorListItemNode;

export type EditorDocument = {
  type: "doc";
  content: EditorBlockNode[];
};

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Expected an HTTPS URL");
const editorLinkUrlSchema = httpsUrlSchema.max(MAX_LINK_URL_LENGTH);

const safeTextSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !/<\/?[a-z][\w:-]*\b/i.test(value),
    "Editor text must not contain HTML or script markup"
  );

const editorMarkSchema: z.ZodType<EditorMark> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: editorLinkUrlSchema,
          rel: z.literal("nofollow noopener noreferrer"),
          target: z.literal("_blank").nullable().optional(),
          class: z.literal("").nullable().optional(),
          title: z.string().max(200).nullable().optional()
        })
        .strict()
    })
    .strict()
]);

const textNodeSchema: z.ZodType<EditorTextNode> = z
  .object({
    type: z.literal("text"),
    text: safeTextSchema,
    marks: z.array(editorMarkSchema).max(3).optional()
  })
  .strict();

const hardBreakNodeSchema: z.ZodType<EditorHardBreakNode> = z
  .object({ type: z.literal("hard_break") })
  .strict();
const inlineNodeSchema: z.ZodType<EditorInlineNode> = z.union([textNodeSchema, hardBreakNodeSchema]);

const paragraphNodeSchema: z.ZodType<EditorParagraphNode> = z
  .object({
    type: z.literal("paragraph"),
    content: z.array(inlineNodeSchema).min(1).max(MAX_INLINE_NODES)
  })
  .strict();

const headingNodeSchema: z.ZodType<EditorHeadingNode> = z
  .object({
    type: z.literal("heading"),
    attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }).strict(),
    content: z.array(textNodeSchema).min(1).max(MAX_INLINE_NODES)
  })
  .strict();

const listItemNodeSchema: z.ZodType<EditorListItemNode> = z.lazy(() =>
  z
    .object({
      type: z.literal("list_item"),
      content: z.array(blockNodeSchema).min(1).max(MAX_BLOCKS_PER_CONTAINER)
    })
    .strict()
);

const listNodeSchema: z.ZodType<EditorListNode> = z.lazy(() =>
  z.union([
    z
      .object({
        type: z.literal("bullet_list"),
        content: z.array(listItemNodeSchema).min(1).max(MAX_LIST_ITEMS)
      })
      .strict(),
    z
      .object({
        type: z.literal("ordered_list"),
        content: z.array(listItemNodeSchema).min(1).max(MAX_LIST_ITEMS)
      })
      .strict()
  ])
);

const blockquoteNodeSchema: z.ZodType<EditorBlockquoteNode> = z.lazy(() =>
  z
    .object({
      type: z.literal("blockquote"),
      content: z
        .array(z.union([paragraphNodeSchema, headingNodeSchema, listNodeSchema]))
        .min(1)
        .max(MAX_BLOCKS_PER_CONTAINER)
    })
    .strict()
);

const blockNodeSchema: z.ZodType<EditorBlockNode> = z.lazy(() =>
  z.union([paragraphNodeSchema, headingNodeSchema, listNodeSchema, blockquoteNodeSchema])
);

export const editorNodeSchema: z.ZodType<EditorNode> = z.lazy(() =>
  z.union([
    textNodeSchema,
    hardBreakNodeSchema,
    paragraphNodeSchema,
    headingNodeSchema,
    listNodeSchema,
    listItemNodeSchema,
    blockquoteNodeSchema
  ])
);

function editorTextLength(node: unknown): number {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return 0;
  }

  const record = node as { text?: unknown; content?: unknown };
  const ownText = typeof record.text === "string" ? record.text.length : 0;
  const nestedText = Array.isArray(record.content)
    ? record.content.reduce((total, child) => total + editorTextLength(child), 0)
    : 0;

  return ownText + nestedText;
}

function editorDocumentDepth(node: unknown): number {
  const stack: Array<{ node: unknown; depth: number }> = [{ node, depth: 0 }];
  let maximumDepth = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !current.node || typeof current.node !== "object" || Array.isArray(current.node)) {
      continue;
    }

    maximumDepth = Math.max(maximumDepth, current.depth);
    const content = (current.node as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const child of content) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }

  return maximumDepth;
}

export const editorDocumentSchema: z.ZodType<EditorDocument> = z
  .object({
    type: z.literal("doc"),
    content: z.array(blockNodeSchema).min(1).max(MAX_DOCUMENT_BLOCKS)
  })
  .strict()
  .superRefine((document, context) => {
    if (editorTextLength(document) > 40_000) {
      context.addIssue({
        code: "custom",
        message: "Editor document must contain at most 40,000 text characters"
      });
    }
    if (editorDocumentDepth(document) > MAX_DOCUMENT_NESTING_DEPTH) {
      context.addIssue({
        code: "custom",
        message: "Editor document must not exceed 12 content nesting levels"
      });
    }
  });

export const bcp47LanguageSchema = z
  .string()
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z]{4}|-[A-Za-z]{2}|-[0-9]{3}|-[A-Za-z0-9]{5,8})*$/, "Expected a BCP-47 language tag")
  .refine(
    (value) => {
      try {
        return Intl.getCanonicalLocales(value).length === 1;
      } catch {
        return false;
      }
    },
    "Expected a valid BCP-47 language tag"
  );

export const privateImagePathSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/,
    "Expected an owner/submission/object image path"
  );

export const submissionInputSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    contentDocument: editorDocumentSchema,
    category: categorySchema,
    region: regionSchema,
    language: bcp47LanguageSchema,
    primarySourceName: z.string().trim().min(1).max(120),
    primarySourceUrl: httpsUrlSchema,
    privateImagePath: privateImagePathSchema,
    guidelinesVersion: z.string().trim().min(1).max(64),
    guidelinesAccepted: z.literal(true)
  })
  .strict();

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

const uuidV4Schema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  "Expected a UUID v4"
);

export const submissionCreateSchema = submissionInputSchema.extend({ id: uuidV4Schema }).strict();
export const submissionSaveSchema = submissionInputSchema.extend({
  expectedVersion: z.number().int().positive().safe(),
  submit: z.boolean().default(false)
}).strict();

export type SubmissionCreate = z.infer<typeof submissionCreateSchema>;
export type SubmissionSave = z.infer<typeof submissionSaveSchema>;
export { uuidV4Schema };
