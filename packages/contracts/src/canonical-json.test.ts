import { describe, expect, test } from "vitest";

import { canonicalJson } from "./canonical-json";

describe("canonicalJson", () => {
  test("sorts nested object keys while preserving Unicode and array order", () => {
    expect(
      canonicalJson({
        z: ["first", { beta: true, alpha: "é" }, "last"],
        a: { δ: "東京", b: 2 },
      }),
    ).toBe('{"a":{"b":2,"δ":"東京"},"z":["first",{"alpha":"é","beta":true},"last"]}');
  });

  test("emits the same bytes for reordered object keys", () => {
    expect(canonicalJson({ nested: { z: 1, a: [3, 2, 1] }, b: true })).toBe(
      canonicalJson({ b: true, nested: { a: [3, 2, 1], z: 1 } }),
    );
  });

  test.each([
    ["undefined", { value: undefined }],
    ["sparse arrays", new Array(1)],
    ["NaN", { value: Number.NaN }],
    ["positive infinity", { value: Number.POSITIVE_INFINITY }],
    ["negative infinity", { value: Number.NEGATIVE_INFINITY }],
    ["bigint", { value: 1n }],
    ["function", { value: () => "not JSON" }],
  ])("rejects %s", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/canonical json/i);
  });
});
