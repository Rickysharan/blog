import { describe, expect, it, vi } from "vitest";

import {
  ContactStoreError,
  processContactPayload,
  type ContactDependencies,
} from "@/lib/contact/service";

const validPayload = {
  inquiryType: "support",
  name: "Ricky Example",
  email: "ricky@example.com",
  organisation: "",
  subject: "Correction request",
  message: "Please review the source linked in this article.",
  website: "",
  submissionKey: "00000000-0000-4000-8000-000000000501",
};

function dependencies(overrides: Partial<ContactDependencies> = {}): ContactDependencies {
  return {
    store: vi.fn().mockResolvedValue({
      inquiryId: "00000000-0000-4000-8000-000000000502",
      created: true,
    }),
    notify: vi.fn().mockResolvedValue(undefined),
    markNotification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("processContactPayload", () => {
  it("rejects unknown fields and malformed inputs without storing them", async () => {
    const deps = dependencies();
    const result = await processContactPayload(
      { ...validPayload, unexpected: "field" },
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(result.status).toBe(400);
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("quietly accepts a filled honeypot without storing or notifying", async () => {
    const deps = dependencies();
    const result = await processContactPayload(
      { ...validPayload, website: "https://spam.invalid" },
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(result).toMatchObject({ status: 202, body: { ok: true } });
    expect(deps.store).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it.each([
    ["general", "editorial"],
    ["support", "editorial"],
    ["advertising", "commercial"],
    ["partnership", "commercial"],
  ] as const)("routes %s enquiries to the %s inbox", async (inquiryType, audience) => {
    const deps = dependencies();
    await processContactPayload(
      { ...validPayload, inquiryType },
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({ audience, inquiryType }),
    );
  });

  it("stores before attempting notification and records success", async () => {
    const order: string[] = [];
    const deps = dependencies({
      store: vi.fn(async () => {
        order.push("store");
        return {
          inquiryId: "00000000-0000-4000-8000-000000000502",
          created: true,
        };
      }),
      notify: vi.fn(async () => {
        order.push("notify");
      }),
      markNotification: vi.fn(async () => {
        order.push("mark");
      }),
    });
    const result = await processContactPayload(
      validPayload,
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(order).toEqual(["store", "notify", "mark"]);
    expect(deps.markNotification).toHaveBeenCalledWith(
      expect.objectContaining({ state: "sent" }),
    );
    expect(result).toMatchObject({ status: 201, body: { ok: true, notification: "sent" } });
  });

  it("returns a clear retry response and never notifies when storage is unavailable", async () => {
    const deps = dependencies({
      store: vi.fn().mockRejectedValue(new ContactStoreError("unavailable")),
    });
    const result = await processContactPayload(
      validPayload,
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(result).toMatchObject({
      status: 503,
      body: { ok: false, code: "storage_unavailable" },
    });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("maps the database rate limit without retrying notification", async () => {
    const deps = dependencies({
      store: vi.fn().mockRejectedValue(new ContactStoreError("rate_limited")),
    });
    const result = await processContactPayload(
      validPayload,
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(result).toMatchObject({ status: 429, body: { code: "rate_limited" } });
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("keeps failed email visible while confirming the stored enquiry", async () => {
    const deps = dependencies({
      notify: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });
    const result = await processContactPayload(
      validPayload,
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(deps.markNotification).toHaveBeenCalledWith(
      expect.objectContaining({ state: "failed", errorCode: "notification_failed" }),
    );
    expect(result).toMatchObject({
      status: 202,
      body: { ok: true, notification: "failed" },
    });
  });

  it("does not notify again when the idempotency key already exists", async () => {
    const deps = dependencies({
      store: vi.fn().mockResolvedValue({
        inquiryId: "00000000-0000-4000-8000-000000000502",
        created: false,
      }),
    });
    const result = await processContactPayload(
      validPayload,
      { identityHash: "a".repeat(64) },
      deps,
    );

    expect(deps.notify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 202, body: { notification: "duplicate" } });
  });
});
