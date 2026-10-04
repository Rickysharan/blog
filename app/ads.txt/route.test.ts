import { afterEach, expect, it } from "vitest";

import { GET } from "./route";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

it("serves the exact validated Google seller record as root plain text", async () => {
  process.env.ADSENSE_PUBLISHER_ID = "pub-1234567890123456";
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/plain");
  await expect(response.text()).resolves.toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
});

it.each([undefined, "pub-test", "ca-pub-1234567890123456", "pub-12345678901234567"])("returns not found rather than a placeholder for invalid publisher id %s", async (publisherId) => {
  if (publisherId === undefined) delete process.env.ADSENSE_PUBLISHER_ID; else process.env.ADSENSE_PUBLISHER_ID = publisherId;
  expect((await GET()).status).toBe(404);
});
