import { afterEach, describe, expect, test, vi } from "vitest";

import { BrevoProvider } from "./brevo";

afterEach(() => vi.restoreAllMocks());

describe("Brevo adapter", () => {
  test("sends bounded transactional payloads and returns only the message id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messageId: "<id@example>" }), { status: 201 }));
    await expect(new BrevoProvider("brevo-secret").send({ sender: { email: "news@example.com" }, to: [{ email: "reader@example.com" }], subject: "Update", textContent: "A short notice" })).resolves.toEqual({ messageId: "<id@example>" });
  });

  test("surfaces quota exhaustion as a sanitized provider error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota", { status: 402 }));
    await expect(new BrevoProvider("brevo-secret").send({ sender: { email: "news@example.com" }, to: [{ email: "reader@example.com" }], subject: "Update", textContent: "A short notice" })).rejects.toMatchObject({ code: "provider_quota_exhausted", status: "exhausted" });
  });
});
