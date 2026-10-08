import { describe, expect, it } from "vitest";
import { buildDraftMdx, type GeneratedDraftContent } from "@/lib/pipeline/generate";
import { normalizeGeneratedBody } from "@/lib/pipeline/normalize-draft";
import type { QueueStory } from "@/lib/pipeline/types";

describe("normalizeGeneratedBody", () => {
  it("removes an exact leading H1 that duplicates the title", () => {
    const result = normalizeGeneratedBody(
      "A Clear News Headline",
      "# A Clear News Headline\n\nThe report was released.\n\n## Why it matters\n\nIt sets a timetable.",
    );

    expect(result.body).toBe(
      "The report was released.\n\n## Why it matters\n\nIt sets a timetable.",
    );
    expect(result.repairs).toEqual(["Removed a duplicate leading headline"]);
  });

  it("recognizes case and spacing variations in the repeated headline", () => {
    const result = normalizeGeneratedBody(
      "A Clear News Headline",
      "  #   a CLEAR   news headline  \n\nLead.\n\n## WHY IT MATTERS\n\nAnalysis.",
    );

    expect(result.body).toBe("Lead.\n\n## Why it matters\n\nAnalysis.");
    expect(result.repairs).toEqual([
      "Removed a duplicate leading headline",
      "Normalized the Why it matters heading",
    ]);
  });

  it("moves an inline Why it matters marker onto its own Markdown line", () => {
    const result = normalizeGeneratedBody(
      "A Clear News Headline",
      "The report was released. ## WHY IT MATTERS The timetable is now public.",
    );

    expect(result.body).toBe(
      "The report was released.\n\n## Why it matters\n\nThe timetable is now public.",
    );
    expect(result.repairs).toContain(
      "Normalized the Why it matters heading",
    );
  });

  it("retains a different legitimate leading heading", () => {
    const result = normalizeGeneratedBody(
      "A Clear News Headline",
      "# What happened\n\nLead.\n\n## Why it matters\n\nAnalysis.",
    );

    expect(result.body).toMatch(/^# What happened/);
    expect(result.repairs).toEqual([]);
  });

  it("removes repeated model source lines", () => {
    const result = normalizeGeneratedBody(
      "A Clear News Headline",
      "Lead.\n\nSource: [First](https://example.com/one)\n\n## Why it matters\n\nAnalysis.\n\nSOURCE: [Second](https://example.com/two)",
    );

    expect(result.body).toBe("Lead.\n\n## Why it matters\n\nAnalysis.");
    expect(result.repairs).toEqual(["Removed model-generated source attribution"]);
  });

  it("leaves unsafe MDX visible to the validator", () => {
    const story: QueueStory = {
      title: "Source title",
      source: "Example Outlet",
      sourceUrl: "https://example.com/story",
      date: "2026-09-30T10:00:00.000Z",
      snippet: "A source snippet.",
      category: "politics",
    };
    const generated: GeneratedDraftContent = {
      title: "A Clear News Headline",
      excerpt: "A short explanation.",
      tags: ["Named Organisation", "Named Place"],
      body: "# A Clear News Headline\n\n<script>bad()</script>\n\n## Why it matters\n\nAnalysis.",
    };

    expect(() => buildDraftMdx(story, generated, true)).toThrow(/unsafe MDX/i);
  });
});
