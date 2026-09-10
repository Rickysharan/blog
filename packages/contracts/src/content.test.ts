import { describe, expect, expectTypeOf, test } from "vitest";

import {
  submissionInputSchema,
  type EditorBlockNode,
  type EditorDocument,
  type SubmissionInput
} from "./content";

const acceptedSubmission = {
  title: "A carefully sourced update",
  contentDocument: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "What changed" }]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Read the " },
          {
            type: "text",
            text: "primary source",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.com/report",
                  rel: "nofollow noopener noreferrer"
                }
              }
            ]
          },
          { type: "text", text: "." }
        ]
      },
      {
        type: "bullet_list",
        content: [
          {
            type: "list_item",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Verified detail" }]
              }
            ]
          }
        ]
      }
    ]
  },
  category: "finance",
  region: "europe",
  language: "en-GB",
  primarySourceName: "Example Research",
  primarySourceUrl: "https://example.com/report",
  privateImagePath:
    "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.webp",
  guidelinesVersion: "2026-08-27",
  guidelinesAccepted: true
} as const;

describe("submissionInputSchema", () => {
  test("accepts an allowlisted editor document and the required submission fields", () => {
    const parsed = submissionInputSchema.parse(acceptedSubmission);

    expectTypeOf<EditorDocument["content"]>().toEqualTypeOf<EditorBlockNode[]>();
    expectTypeOf<SubmissionInput["contentDocument"]["content"]>().toEqualTypeOf<EditorBlockNode[]>();
    expectTypeOf(parsed.contentDocument.content).toEqualTypeOf<EditorBlockNode[]>();
    expect(parsed).toMatchObject({
      title: "A carefully sourced update",
      category: "finance",
      language: "en-GB",
      guidelinesAccepted: true
    });
    expect(parsed.contentDocument.content[0]?.type).toBe("heading");
  });

  test("rejects an unknown submission field", () => {
    expect(
      submissionInputSchema.safeParse({ ...acceptedSubmission, authorId: "spoofed" }).success
    ).toBe(false);
  });

  test.each([
    {
      label: "raw HTML nodes",
      contentDocument: { type: "doc", content: [{ type: "html", value: "<p>Unsafe</p>" }] }
    },
    {
      label: "script nodes",
      contentDocument: { type: "doc", content: [{ type: "script", src: "https://evil.example/x.js" }] }
    },
    {
      label: "script markup in text",
      contentDocument: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }]
      }
    }
  ])("rejects $label", ({ contentDocument }) => {
    expect(submissionInputSchema.safeParse({ ...acceptedSubmission, contentDocument }).success).toBe(
      false
    );
  });

  test("rejects a non-HTTPS primary source URL", () => {
    expect(
      submissionInputSchema.safeParse({ ...acceptedSubmission, primarySourceUrl: "http://example.com" })
        .success
    ).toBe(false);
  });

  test("rejects a primary source name that cannot be published", () => {
    expect(
      submissionInputSchema.safeParse({
        ...acceptedSubmission,
        primarySourceName: "s".repeat(121)
      }).success
    ).toBe(false);
  });

  test("rejects an invalid BCP-47 language tag", () => {
    expect(submissionInputSchema.safeParse({ ...acceptedSubmission, language: "en-12" }).success).toBe(
      false
    );
  });

  test("rejects an image path that is not owner/submission/object scoped", () => {
    expect(
      submissionInputSchema.safeParse({
        ...acceptedSubmission,
        privateImagePath: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000003.webp"
      }).success
    ).toBe(false);
  });

  test("rejects an image path whose submission id is not UUID v4", () => {
    expect(
      submissionInputSchema.safeParse({
        ...acceptedSubmission,
        privateImagePath:
          "00000000-0000-4000-8000-000000000001/00000000-0000-1000-8000-000000000002/00000000-0000-4000-8000-000000000003.webp"
      }).success
    ).toBe(false);
  });

  test("rejects image paths with uppercase UUID characters", () => {
    expect(
      submissionInputSchema.safeParse({
        ...acceptedSubmission,
        privateImagePath:
          "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-00000000000A.webp"
      }).success
    ).toBe(false);
  });

  test("rejects a list whose child is not a list item", () => {
    expect(
      submissionInputSchema.safeParse({
        ...acceptedSubmission,
        contentDocument: {
          type: "doc",
          content: [
            {
              type: "bullet_list",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Wrong list child" }] }
              ]
            }
          ]
        }
      }).success
    ).toBe(false);
  });

  test("rejects more than 40,000 editor text characters", () => {
    expect(
      submissionInputSchema.safeParse({
        ...acceptedSubmission,
        contentDocument: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(40_001) }] }]
        }
      }).success
    ).toBe(false);
  });

  test("rejects guidelines that have not been accepted", () => {
    expect(
      submissionInputSchema.safeParse({ ...acceptedSubmission, guidelinesAccepted: false }).success
    ).toBe(false);
  });
});
