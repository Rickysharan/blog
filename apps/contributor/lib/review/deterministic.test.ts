import { describe, expect, test } from "vitest";

import { contentSha256, runQualityGate, runTextSafetyGate } from "./deterministic";

const paragraph = (text: string) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text }] });
const doc = (text: string) => ({ type: "doc" as const, content: [paragraph(text)] });

describe("deterministic review gates", () => {
  test("rejects spam and routes incomplete stories to manual review", () => {
    expect(runQualityGate({ title: "BUY NOW!!!", contentDocument: doc("buy now"), category: "movies" }).outcome).toBe("reject");
    expect(runQualityGate({ title: "A useful report", contentDocument: doc("short"), category: "movies" }).outcome).toBe("manual_review");
  });

  test("requires the finance disclaimer", () => {
    const result = runQualityGate({ title: "Markets move", contentDocument: doc("word ".repeat(140)), category: "finance" });
    expect(result.reasons).toContain("quality.finance_disclaimer_missing");
  });

  test("rejects unsupported editor JSON and unsafe markup", () => {
    expect(runTextSafetyGate({ type: "doc", content: [{ type: "script", src: "https://evil" }] }).outcome).toBe("manual_review");
    expect(runTextSafetyGate(doc("<script>alert(1)</script>")).outcome).toBe("manual_review");
  });

  test("hashes equivalent object key order identically", () => {
    expect(contentSha256(doc("hello"))).toBe(contentSha256({ content: [{ content: [{ text: "hello", type: "text" }], type: "paragraph" }], type: "doc" } as never));
  });
});
