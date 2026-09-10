import { describe, expect, test } from "vitest";

import {
  escapeMarkdownLinkLabel,
  escapeMarkdownText,
  safeMarkdownHttpsDestination,
} from "./escape";

describe("Markdown escaping", () => {
  test("escapes inline Markdown control characters in contributor prose", () => {
    expect(escapeMarkdownText("Plan *carefully* with [brackets], _italics_, \`code\`, and \\slashes.")).toBe(
      "Plan \\*carefully\\* with \\[brackets\\], \\_italics\\_, \\\`code\\\`, and \\\\slashes.",
    );
  });

  test("escapes source labels without changing their visible words", () => {
    expect(escapeMarkdownLinkLabel("A [source] \\ archive")).toBe("A \\[source\\] \\\\ archive");
  });

  test("escapes block-forming Markdown tokens at the start of contributor text lines", () => {
    expect(escapeMarkdownText("# heading\n- item\n1. item\n> quote")).toBe(
      "\\# heading\n\\- item\n\\1. item\n\\> quote",
    );
  });

  test("escapes GFM strikethrough, tables, setext headings, and thematic breaks in plain text", () => {
    expect(escapeMarkdownText("~~removed~~ | column |\nTitle\n---\nHeading\n===\n***")).toBe(
      "\\~\\~removed\\~\\~ \\| column \\|\nTitle\n\\-\\-\\-\nHeading\n\\=\\=\\=\n\\*\\*\\*",
    );
  });

  test("serializes an HTTPS Markdown destination without preserving delimiter syntax", () => {
    expect(safeMarkdownHttpsDestination("https://example.com/report)?filter=(global)")).toBe(
      "https://example.com/report%29?filter=%28global%29",
    );
  });

  test.each([
    "https://example.com/report)\r\n\r\n{danger}",
    "https://user:pass@example.com/report",
    "http://example.com/report",
    "https://example.com/report with-space",
    "https://example.com/" + "a".repeat(2_049),
  ])("rejects an unsafe Markdown destination", (url) => {
    expect(() => safeMarkdownHttpsDestination(url)).toThrow();
  });
});
