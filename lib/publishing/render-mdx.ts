import matter from "gray-matter";

import {
  publicationPayloadSchema,
  type EditorBlockNode,
  type EditorDocument,
  type EditorInlineNode,
  type EditorListItemNode,
  type EditorListNode,
  type EditorMark,
  type EditorTextNode,
  type PublicationPayload,
} from "@omnilede/contracts";
import { parseArticleFile } from "@/lib/content/schema";

import {
  escapeMarkdownLinkLabel,
  escapeMarkdownText,
  safeMarkdownHttpsDestination,
} from "./escape";
import {
  PublicationValidationError,
  validateContributorCoverImage,
} from "./validate-image";

export { PublicationValidationError } from "./validate-image";

function invalidPublication(): never {
  throw new PublicationValidationError();
}

function assertSafeRawText(value: string): void {
  if (
    /[{}]/.test(value) ||
    /<\/?[a-z][^>]*>/i.test(value) ||
    /<>|<\/>|<!--/.test(value) ||
    /(?:^|\n)\s*(?:import|export)\b/i.test(value)
  ) {
    invalidPublication();
  }
}

function assertSafeDocumentText(document: EditorDocument): void {
  const lines: string[] = [];

  const visit = (node: EditorDocument | EditorBlockNode | EditorListItemNode | EditorInlineNode): void => {
    if (node.type === "text") {
      lines.push(node.text);
      return;
    }
    if (node.type === "hard_break") {
      lines.push("\n");
      return;
    }
    for (const child of node.content) {
      visit(child);
    }
    lines.push("\n");
  };

  visit(document);
  const rawBody = lines.join("");
  assertSafeRawText(rawBody);
  if (/(?:^|\n)\s*(?:source\s*:|by\s+)/i.test(rawBody)) {
    invalidPublication();
  }
}

function safeDestination(url: string): string {
  try {
    return safeMarkdownHttpsDestination(url);
  } catch {
    return invalidPublication();
  }
}

function renderText(node: EditorTextNode): string {
  assertSafeRawText(node.text);
  const marks = node.marks ?? [];
  const markTypes = new Set(marks.map((mark) => mark.type));
  if (markTypes.size !== marks.length) return invalidPublication();

  let rendered = escapeMarkdownText(node.text);
  const link = marks.find((mark): mark is Extract<EditorMark, { type: "link" }> => mark.type === "link");
  if (link) {
    rendered = "[" + escapeMarkdownLinkLabel(node.text) + "](" + safeDestination(link.attrs.href) + ")";
  }
  if (marks.some((mark) => mark.type === "italic")) rendered = "_" + rendered + "_";
  if (marks.some((mark) => mark.type === "bold")) rendered = "**" + rendered + "**";
  return rendered;
}

function renderInline(nodes: EditorInlineNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return renderText(node);
      if (node.type === "hard_break") return "  \n";
      return invalidPublication();
    })
    .join("");
}

function indentLines(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join("\n");
}

function indentContinuations(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line, index) => (index === 0 || line.length === 0 ? line : prefix + line))
    .join("\n");
}

function renderListItem(item: EditorListItemNode, marker: string, indent: number): string {
  const [first, ...rest] = item.content;
  if (!first) return invalidPublication();

  const continuationIndent = indent + marker.length + 1;
  let rendered: string;
  if (first.type === "paragraph") {
    rendered = " ".repeat(indent) + marker + " " + indentContinuations(
      renderInline(first.content),
      continuationIndent,
    );
  } else if (first.type === "heading") {
    rendered = " ".repeat(indent) + marker + " " + "#".repeat(first.attrs.level) + " " + renderInline(first.content);
  } else {
    rendered = " ".repeat(indent) + marker + "\n" + indentLines(renderBlock(first), continuationIndent);
  }

  for (const block of rest) {
    rendered += "\n" + indentLines(renderBlock(block), continuationIndent);
  }
  return rendered;
}

function renderList(node: EditorListNode, indent = 0): string {
  return node.content
    .map((item, index) => renderListItem(item, node.type === "ordered_list" ? String(index + 1) + "." : "-", indent))
    .join("\n");
}

function renderBlockquote(blocks: EditorBlockNode[]): string {
  return renderBlocks(blocks)
    .split("\n")
    .map((line) => (line.length === 0 ? ">" : "> " + line))
    .join("\n");
}

function renderBlock(node: EditorBlockNode): string {
  switch (node.type) {
    case "paragraph":
      return renderInline(node.content);
    case "heading":
      return "#".repeat(node.attrs.level) + " " + renderInline(node.content);
    case "bullet_list":
    case "ordered_list":
      return renderList(node);
    case "blockquote":
      return renderBlockquote(node.content);
    default:
      return invalidPublication();
  }
}

function renderBlocks(blocks: EditorBlockNode[]): string {
  return blocks.map(renderBlock).join("\n\n");
}

function publicationFrontmatter(publication: PublicationPayload, coverImage: string) {
  return {
    title: publication.title,
    slug: publication.slug,
    date: publication.date,
    category: publication.category,
    tags: publication.tags,
    author: publication.contributorName,
    excerpt: publication.excerpt,
    coverImage,
    readTime: publication.readTime,
    sourceName: publication.sourceName,
    sourceUrl: publication.sourceUrl,
    region: publication.region,
    language: publication.language,
    contributorId: publication.contributorId,
    contributorName: publication.contributorName,
    submissionId: publication.submissionId,
    publicationId: publication.publicationId,
  };
}

/** Renders only the shared, validated editor document into canonical MDX for one publication. */
export function renderPublicationMdx(input: {
  publication: unknown;
  publishedImageOrigin: string;
}): string {
  const parsed = publicationPayloadSchema.safeParse(input.publication);
  if (!parsed.success) return invalidPublication();
  const publication = parsed.data;

  assertSafeRawText(publication.contributorName);
  assertSafeRawText(publication.sourceName);
  if (/[\r\n]/.test(publication.contributorName) || /[\r\n]/.test(publication.sourceName)) {
    return invalidPublication();
  }
  assertSafeDocumentText(publication.contentDocument);
  const coverImage = validateContributorCoverImage({
    coverImage: publication.coverImage,
    publicationId: publication.publicationId,
    publishedImageOrigin: input.publishedImageOrigin,
  });
  const sourceUrl = safeDestination(publication.sourceUrl);
  const sourceFooter = "Source: [" + escapeMarkdownLinkLabel(publication.sourceName) + "](" + sourceUrl + ")";
  const body = [
    "By " + escapeMarkdownText(publication.contributorName),
    renderBlocks(publication.contentDocument.content),
    sourceFooter,
  ].join("\n\n");
  const mdx = matter.stringify(
    body + "\n",
    publicationFrontmatter({ ...publication, sourceUrl }, coverImage),
  );

  try {
    parseArticleFile(mdx, publication.slug + ".mdx");
  } catch {
    return invalidPublication();
  }
  if (!mdx.trimEnd().endsWith(sourceFooter) || (mdx.match(/^Source:/gm) ?? []).length !== 1) {
    return invalidPublication();
  }
  return mdx;
}
