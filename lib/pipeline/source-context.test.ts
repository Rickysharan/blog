import { describe, expect, it, vi } from "vitest";

import {
  extractSourceContext,
  fetchSourceContext,
} from "@/lib/pipeline/source-context";
import type { QueueStory } from "@/lib/pipeline/types";

const story: QueueStory = {
  title: "Example story",
  source: "Example",
  sourceUrl: "https://example.com/story",
  date: "2026-10-07T12:00:00.000Z",
  snippet: "A short feed summary.",
  category: "sports",
};

function usefulParagraph(prefix: string): string {
  return Array.from(
    { length: 65 },
    (_, index) =>
      `${prefix}${index} confirmed reporting detail`,
  ).join(" ");
}

describe("source-page context", () => {
  it("extracts substantial article paragraphs and removes executable markup", () => {
    const html = `
      <html>
        <body>
          <script>window.evil = true;</script>
          <p>${usefulParagraph("alpha")}</p>
          <p>${usefulParagraph("beta")}</p>
        </body>
      </html>
    `;

    const result = extractSourceContext(html);

    expect(result).toContain("alpha0");
    expect(result).toContain("beta0");
    expect(result).not.toContain("window.evil");
    expect(result).not.toContain("<script>");
  });

  it("never returns more than the configured 1500 source words", () => {
    const paragraph = Array.from(
      { length: 1700 },
      (_, index) => `word${index}`,
    ).join(" ");

    const result = extractSourceContext(
      `<html><body><p>${paragraph}</p></body></html>`,
    );

    expect(result).toBeDefined();

    const wordCount =
      result?.match(
        /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu,
      )?.length ?? 0;

    expect(wordCount).toBe(1500);
  });

  it("rejects thin source pages", () => {
    expect(
      extractSourceContext(
        "<html><body><p>This page is too short to support a grounded article.</p></body></html>",
      ),
    ).toBeUndefined();
  });

  it("fetches only bounded HTML source material", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        `<html><body><p>${usefulParagraph("fact")}</p><p>${usefulParagraph("more")}</p></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      ),
    );

    const result = await fetchSourceContext(story, {
      fetchImpl: fetcher,
    });

    expect(result).toContain("fact0");
    expect(fetcher).toHaveBeenCalledWith(
      new URL(story.sourceUrl),
      expect.objectContaining({
        redirect: "follow",
      }),
    );
  });

  it("fails closed when source retrieval is unavailable", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(
      fetchSourceContext(story, { fetchImpl: fetcher }),
    ).resolves.toBeUndefined();
  });
});
