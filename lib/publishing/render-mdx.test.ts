import { describe, expect, test } from "vitest";

import { renderPublicationMdx, PublicationValidationError } from "./render-mdx";
import { parseArticleFile } from "@/lib/content/schema";

const publishedImageOrigin = "https://project-id.supabase.co/storage/v1/object/public/published-images";
const publicationId = "10000000-0000-4000-8000-000000000001";

const publication = {
  publicationId,
  submissionId: "10000000-0000-4000-8000-000000000002",
  submissionVersion: 3,
  title: "A title: with # YAML delimiters",
  slug: "carefully-sourced-contributor-update",
  date: "2026-08-27",
  category: "finance",
  tags: ["markets", "policy: global"],
  contributorId: "10000000-0000-4000-8000-000000000003",
  contributorName: "Ada: Contributor #1",
  excerpt: "A concise: explanation # with YAML delimiters.",
  coverImage: publishedImageOrigin + "/" + publicationId + ".webp",
  readTime: 6,
  sourceName: "Example: [Research] #1",
  sourceUrl: "https://example.com/report?edition=global",
  region: "europe",
  language: "en-GB",
  contentDocument: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "A heading" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          { type: "text", text: " and " },
          { type: "text", text: "italic", marks: [{ type: "italic" }] },
          {
            type: "text",
            text: " linked",
            marks: [{ type: "link", attrs: { href: "https://example.com/guide", rel: "nofollow noopener noreferrer" } }],
          },
          { type: "hard_break" },
          { type: "text", text: "Escaped *markdown* [label]" },
        ],
      },
      {
        type: "ordered_list",
        content: [
          {
            type: "list_item",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First" }] },
              {
                type: "bullet_list",
                content: [
                  { type: "list_item", content: [{ type: "paragraph", content: [{ type: "text", text: "Nested" }] }] },
                ],
              },
            ],
          },
          { type: "list_item", content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }] },
        ],
      },
      {
        type: "blockquote",
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Quoted" }] },
          { type: "paragraph", content: [{ type: "text", text: "A quote." }] },
        ],
      },
    ],
  },
  guidelinesVersion: "2026-08-27",
} as const;

describe("renderPublicationMdx", () => {
  test("renders every allowed editor node and mark into canonical parsed MDX", () => {
    const mdx = renderPublicationMdx({ publication, publishedImageOrigin });

    expect(mdx).toContain("**Bold** and _italic_[ linked](https://example.com/guide)" + "  \n");
    expect(mdx.replaceAll("  \n", "\\u0020\\u0020\\n")).toMatchSnapshot();
  });

  test("ends with exactly one visible generated source footer", () => {
    const mdx = renderPublicationMdx({ publication, publishedImageOrigin });

    expect(
      mdx.trimEnd().endsWith(
        "Source: [Example: \\[Research\\] #1](https://example.com/report?edition=global)",
      ),
    ).toBe(true);
    expect(mdx.match(/^Source:/gm)).toHaveLength(1);
    expect(() => parseArticleFile(mdx, publication.slug + ".mdx")).not.toThrow();
  });

  test.each([
    ["editor link", {
      ...publication,
      contentDocument: {
        type: "doc",
        content: [{
          type: "paragraph",
          content: [{
            type: "text",
            text: "Click",
            marks: [{
              type: "link",
              attrs: {
                href: "https://example.com/report)\r\n\r\n{danger}",
                rel: "nofollow noopener noreferrer",
              },
            }],
          }],
        }],
      },
    }],
    ["source URL", {
      ...publication,
      sourceUrl: "https://example.com/report)\r\n\r\n{danger}",
    }],
  ])("rejects a %s that could close Markdown and inject MDX", (_label, unsafe) => {
    expect(() => renderPublicationMdx({ publication: unsafe, publishedImageOrigin })).toThrow(
      PublicationValidationError,
    );
  });

  test("indents hard-break continuations and nested children using the list marker width", () => {
    const tenItems = Array.from({ length: 10 }, (_, index) => ({
      type: "list_item" as const,
      content: index === 9
        ? [
            { type: "paragraph" as const, content: [{ type: "text" as const, text: "Tenth" }] },
            {
              type: "bullet_list" as const,
              content: [{
                type: "list_item" as const,
                content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Nested under ten" }] }],
              }],
            },
          ]
        : [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Item " + String(index + 1) }] }],
    }));
    const listPublication = {
      ...publication,
      contentDocument: {
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [{
              type: "list_item",
              content: [{
                type: "paragraph",
                content: [{ type: "text", text: "First line" }, { type: "hard_break" }, { type: "text", text: "Continuation" }],
              }],
            }],
          },
          { type: "ordered_list", content: tenItems },
        ],
      },
    };

    const mdx = renderPublicationMdx({ publication: listPublication, publishedImageOrigin });
    expect(mdx).toContain("- First line" + "  \n  Continuation");
    expect(mdx).toContain("10. Tenth\n    - Nested under ten");
  });

  test.each([
    ["MDX expression braces", { type: "paragraph", content: [{ type: "text", text: "Hello {danger}" }] }],
    ["raw HTML", { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }],
    ["JSX", { type: "paragraph", content: [{ type: "text", text: "<Component />" }] }],
    ["MDX fragment", { type: "paragraph", content: [{ type: "text", text: "<>unsafe</>" }] }],
    ["import", { type: "paragraph", content: [{ type: "text", text: "import danger from 'x'" }] }],
    ["export", { type: "paragraph", content: [{ type: "text", text: "export const danger = true" }] }],
    ["forged source footer", { type: "paragraph", content: [{ type: "text", text: "Source: [Forged](https://attacker.example)" }] }],
    ["forged byline", { type: "paragraph", content: [{ type: "text", text: "By Attacker" }] }],
    ["unknown node", { type: "image", attrs: { src: "https://attacker.example/image.webp" } }],
    ["unsafe link", { type: "paragraph", content: [{ type: "text", text: "Click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)", rel: "nofollow noopener noreferrer" } }] }] }],
    ["unknown mark", { type: "paragraph", content: [{ type: "text", text: "Click", marks: [{ type: "code" }] }] }],
  ])("rejects %s with a sanitized publication-validation error", (_label, block) => {
    const unsafe = {
      ...publication,
      contentDocument: { type: "doc", content: [block] },
    };

    try {
      renderPublicationMdx({ publication: unsafe, publishedImageOrigin });
      throw new Error("Expected publication validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PublicationValidationError);
      expect(error).toMatchObject({ code: "publication_validation_failed" });
      expect(String(error)).not.toContain("attacker.example");
      expect(String(error)).not.toContain("danger");
    }
  });
});
