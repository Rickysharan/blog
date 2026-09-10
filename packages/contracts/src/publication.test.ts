import { describe, expect, test } from "vitest";

import { publicationPayloadSchema } from "./publication";

const acceptedPublication = {
  publicationId: "10000000-0000-4000-8000-000000000001",
  submissionId: "10000000-0000-4000-8000-000000000002",
  submissionVersion: 3,
  title: "A carefully sourced contributor update",
  slug: "carefully-sourced-contributor-update",
  date: "2026-08-27",
  category: "finance",
  tags: ["markets", "policy"],
  contributorId: "10000000-0000-4000-8000-000000000003",
  contributorName: "Ada Contributor",
  excerpt: "A concise explanation of a verified market development.",
  coverImage: "https://images.example.com/publication.webp",
  readTime: 6,
  sourceName: "Example Research",
  sourceUrl: "https://example.com/report",
  region: "europe",
  language: "en-GB",
  contentDocument: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "The verified update." }],
      },
    ],
  },
  guidelinesVersion: "2026-08-27",
} as const;

describe("publicationPayloadSchema", () => {
  test("accepts exactly the shared publication payload keys", () => {
    const parsed = publicationPayloadSchema.parse(acceptedPublication);

    expect(Object.keys(parsed).sort()).toEqual([
      "category",
      "contentDocument",
      "contributorId",
      "contributorName",
      "coverImage",
      "date",
      "excerpt",
      "guidelinesVersion",
      "language",
      "publicationId",
      "readTime",
      "region",
      "slug",
      "sourceName",
      "sourceUrl",
      "submissionId",
      "submissionVersion",
      "tags",
      "title",
    ]);
  });

  test.each([
    ["invalid slug", { slug: "Not a slug" }],
    ["unsupported category", { category: "technology" }],
    ["HTTP source URL", { sourceUrl: "http://example.com/report" }],
    ["HTTP image URL", { coverImage: "http://images.example.com/publication.webp" }],
    ["extra field", { author: "Spoofed byline" }],
  ])("rejects a publication payload with %s", (_label, change) => {
    expect(publicationPayloadSchema.safeParse({ ...acceptedPublication, ...change }).success).toBe(
      false,
    );
  });

  test.each([
    ["raw HTML editor node", { type: "doc", content: [{ type: "html", value: "<p>Unsafe</p>" }] }],
    [
      "overlong editor body",
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "a".repeat(40_001) }] },
        ],
      },
    ],
  ])("rejects a publication payload with %s", (_label, contentDocument) => {
    expect(
      publicationPayloadSchema.safeParse({ ...acceptedPublication, contentDocument }).success,
    ).toBe(false);
  });

  test("rejects more than twelve tags and an invalid guidelines version", () => {
    expect(
      publicationPayloadSchema.safeParse({
        ...acceptedPublication,
        tags: Array.from({ length: 13 }, (_, index) => `tag-${index}`),
      }).success,
    ).toBe(false);
    expect(
      publicationPayloadSchema.safeParse({ ...acceptedPublication, guidelinesVersion: "" }).success,
    ).toBe(false);
  });

  test("rejects source and image URLs longer than 2,048 characters", () => {
    const overlongUrl = `https://example.com/${"a".repeat(2_048)}`;

    expect(
      publicationPayloadSchema.safeParse({ ...acceptedPublication, sourceUrl: overlongUrl }).success,
    ).toBe(false);
    expect(
      publicationPayloadSchema.safeParse({ ...acceptedPublication, coverImage: overlongUrl }).success,
    ).toBe(false);
  });

  test.each([
    [
      "more than 100 top-level blocks",
      {
        type: "doc",
        content: Array.from({ length: 101 }, () => ({
          type: "paragraph",
          content: [{ type: "text", text: "A bounded block." }],
        })),
      },
    ],
    [
      "more than 200 inline hard breaks",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: Array.from({ length: 201 }, () => ({ type: "hard_break" })),
          },
        ],
      },
    ],
    [
      "more than 100 list items",
      {
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: Array.from({ length: 101 }, () => ({
              type: "list_item",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "A bounded list item." }],
                },
              ],
            })),
          },
        ],
      },
    ],
    [
      "a document nested more than twelve levels deep",
      {
        type: "doc",
        content: [
          Array.from({ length: 7 }).reduce<unknown>(
            (child) => ({
              type: "bullet_list",
              content: [{ type: "list_item", content: [child] }],
            }),
            {
              type: "paragraph",
              content: [{ type: "text", text: "A deeply nested item." }],
            },
          ),
        ],
      },
    ],
    [
      "a link URL longer than 2,048 characters",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Long link",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: `https://example.com/${"a".repeat(2_048)}`,
                      rel: "nofollow noopener noreferrer",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  ])("rejects $0", (_label, contentDocument) => {
    expect(
      publicationPayloadSchema.safeParse({ ...acceptedPublication, contentDocument }).success,
    ).toBe(false);
  });
});
