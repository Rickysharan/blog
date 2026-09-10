import { beforeEach, describe, expect, it, vi } from "vitest";

const contactMocks = vi.hoisted(() => ({
  createContactDependencies: vi.fn(() => ({ marker: "dependencies" })),
  hashContactIdentity: vi.fn(() => "a".repeat(64)),
  processContactPayload: vi.fn(),
}));

vi.mock("@/lib/contact/service", () => contactMocks);

import { POST } from "@/app/api/contact/route";

describe("contact route", () => {
  beforeEach(() => {
    contactMocks.createContactDependencies.mockClear();
    contactMocks.hashContactIdentity.mockClear();
    contactMocks.processContactPayload.mockReset();
  });

  it("rejects non-JSON bodies before creating service dependencies", async () => {
    const response = await POST(new Request("https://news.example/api/contact", {
      method: "POST",
      body: "plain text",
      headers: { "content-type": "text/plain" },
    }));

    expect(response.status).toBe(415);
    expect(contactMocks.createContactDependencies).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before parsing", async () => {
    const response = await POST(new Request("https://news.example/api/contact", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "content-length": "32769",
      },
    }));

    expect(response.status).toBe(413);
    expect(contactMocks.createContactDependencies).not.toHaveBeenCalled();
  });

  it("uses a pseudonymous request identity and preserves the service status", async () => {
    contactMocks.processContactPayload.mockResolvedValue({
      status: 202,
      body: { ok: true, code: "stored_notification_failed", message: "Stored." },
    });
    const response = await POST(new Request("https://news.example/api/contact", {
      method: "POST",
      body: JSON.stringify({ marker: "payload" }),
      headers: {
        "content-type": "application/json",
        "x-nf-client-connection-ip": "203.0.113.10",
      },
    }));

    expect(contactMocks.hashContactIdentity).toHaveBeenCalledWith(
      "203.0.113.10",
      expect.any(String),
    );
    expect(contactMocks.processContactPayload).toHaveBeenCalledWith(
      { marker: "payload" },
      { identityHash: "a".repeat(64) },
      { marker: "dependencies" },
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
