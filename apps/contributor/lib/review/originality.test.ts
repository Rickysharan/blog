import { describe, expect, test } from "vitest";

import { compareOriginality, distinctiveSentences, titlePhrases } from "./originality";

describe("bounded originality evidence", () => {
  test("selects at most four sentences and two title phrases", () => {
    expect(distinctiveSentences("One long sentence with enough words to qualify. Another long sentence with enough words to qualify. Third long sentence with enough words to qualify. Fourth long sentence with enough words to qualify. Fifth long sentence with enough words to qualify.")).toHaveLength(4);
    expect(titlePhrases("Global markets shift after central bank signals"),).toHaveLength(2);
  });

  test("excludes the primary source and routes exact evidence to manual review", () => {
    const text = "A distinctive sentence with enough words to compare against an external source.";
    const result = compareOriginality(text, "wire.example", [
      { title: "Primary", url: "https://wire.example/a", domain: "wire.example", snippet: text },
      { title: "Other", url: "https://other.example/a", domain: "other.example", snippet: text }
    ]);
    expect(result.evidence.sourceExcluded).toBe(1);
    expect(result.outcome).toBe("manual_review");
    expect(result.reasons).toContain("originality.similarity_requires_editor_review");
  });

  test("uses a manual fallback with no external results", () => {
    expect(compareOriginality("A sentence with enough words to qualify for comparison.", "wire.example", []).outcome).toBe("manual_review");
  });
});
