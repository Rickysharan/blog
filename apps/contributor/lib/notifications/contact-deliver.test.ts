import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn(), update: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  const service = { from: vi.fn(() => query) };
  const send = vi.fn();
  return { query, service, send };
});

vi.mock("../supabase/server", () => ({ createServiceSupabaseClient: vi.fn(() => mocks.service) }));
vi.mock("../providers/brevo", () => ({ BrevoProvider: class { send = mocks.send; } }));

import { deliverContactInquiry } from "./contact-deliver";

const inquiry = {
  id: "00000000-0000-4000-8000-000000000020",
  sender_email: "reader@example.com",
  message: "[advertising] Please send the partner information.",
  delivery_state: "pending"
};

describe("contact outbox delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BREVO_API_KEY = "brevo-test-key";
    process.env.CONTACT_INBOX_EMAIL = "desk@example.com";
    process.env.BREVO_SENDER_EMAIL = "notifications@example.com";
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.maybeSingle.mockResolvedValue({ data: inquiry, error: null });
    mocks.send.mockResolvedValue({ messageId: "message-id" });
  });

  test("sends only after loading a pending stored enquiry and marks it sent", async () => {
    await expect(deliverContactInquiry(inquiry.id)).resolves.toBe("sent");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: [{ email: "desk@example.com" }],
      textContent: expect.stringContaining("reader@example.com")
    }));
    expect(mocks.query.update).toHaveBeenCalledWith({ delivery_state: "sent" });
  });

  test("marks provider failures failed for visible admin follow-up", async () => {
    mocks.send.mockRejectedValue(new Error("quota"));
    await expect(deliverContactInquiry(inquiry.id)).resolves.toBe("failed");
    expect(mocks.query.update).toHaveBeenCalledWith({ delivery_state: "failed" });
  });

  test("does not send when contact delivery is not configured", async () => {
    delete process.env.CONTACT_INBOX_EMAIL;
    await expect(deliverContactInquiry(inquiry.id)).resolves.toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.query.update).toHaveBeenCalledWith({ delivery_state: "failed" });
  });

  test("is idempotent for an enquiry already delivered", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { ...inquiry, delivery_state: "sent" }, error: null });
    await expect(deliverContactInquiry(inquiry.id)).resolves.toBe("already_sent");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.query.update).not.toHaveBeenCalled();
  });
});
