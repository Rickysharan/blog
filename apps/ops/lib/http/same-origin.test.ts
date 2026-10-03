import { describe, expect, it } from "vitest";
import { requireSameOrigin, readBoundedJson } from "./same-origin";
const url = "https://studio.example.com/api/content/drafts";
describe("Studio request boundary", () => {
  it.each([null, "null", "https://evil.example.com", "https://studio.example.com.evil.com", "https://studio.example.com/path"])("rejects origin %s", origin => {
    expect(() => requireSameOrigin(new Request(url, { headers: origin ? { origin } : {} }))).toThrow();
  });
  it("accepts the exact origin and rejects cross-site fetch metadata", () => {
    expect(() => requireSameOrigin(new Request(url, { headers: { origin: "https://studio.example.com" } }))).not.toThrow();
    expect(() => requireSameOrigin(new Request(url, { headers: { origin: "https://studio.example.com", "sec-fetch-site": "cross-site" } }))).toThrow();
  });
  it("bounds the streamed body even without content-length", async () => {
    await expect(readBoundedJson(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mdx: "x".repeat(270000) }) }))).rejects.toMatchObject({ status: 413 });
  });
  it("requires JSON and rejects malformed JSON", async () => {
    await expect(readBoundedJson(new Request(url, { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
    await expect(readBoundedJson(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
  });
});
