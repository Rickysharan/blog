import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn()
  };
  const service = { from: vi.fn(() => query) };
  const rateLimit = vi.fn();
  const deliverContactInquiry = vi.fn();
  return { query, service, rateLimit, deliverContactInquiry };
});

vi.mock("../../../lib/supabase/server", () => ({ createServiceSupabaseClient: vi.fn(() => mocks.service) }));
vi.mock("../../../lib/auth/rate-limit", () => ({ consumeAuthRateLimit: mocks.rateLimit }));
vi.mock("../../../lib/notifications/contact-deliver", () => ({ deliverContactInquiry: mocks.deliverContactInquiry }));

import { POST } from "./route";

function request(body: unknown, origin = "https://contributors.example") {
  return new Request("https://contributors.example/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body)
  });
}

describe("contact route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_ALLOWED_ORIGINS = "https://contributors.example";
    mocks.rateLimit.mockResolvedValue({ allowed: true, unavailable: false });
    mocks.query.insert.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.single.mockResolvedValue({ data: { id: "00000000-0000-4000-8000-000000000020" }, error: null });
    mocks.deliverContactInquiry.mockResolvedValue("sent");
  });

  test("stores general enquiries before returning success", async () => {
    const response = await POST(request({ category: "general", email: " NEWS@Example.COM ", message: "I have a useful question for the desk." }));
    expect(response.status).toBe(201);
    expect(mocks.rateLimit).toHaveBeenCalledWith(mocks.service, "contact.general", "news@example.com", 3, 86_400);
    expect(mocks.query.insert).toHaveBeenCalledWith({
      sender_email: "news@example.com",
      message: "[general] I have a useful question for the desk.",
      delivery_state: "pending",
      moderation_state: "unreviewed"
    });
    expect(mocks.deliverContactInquiry).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000020");
  });

  test("supports advertising and partnership routing without exposing a second endpoint", async () => {
    await POST(request({ category: "advertising", email: "brand@example.com", message: "Please share your launch placement options." }));
    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({ message: "[advertising] Please share your launch placement options." }));
    await POST(request({ category: "partnership", email: "partner@example.com", message: "We would like to explore a research partnership." }));
    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({ message: "[partnership] We would like to explore a research partnership." }));
  });

  test("rejects invalid input and origins before database work", async () => {
    expect((await POST(request({ category: "general", email: "bad", message: "too short" }))).status).toBe(400);
    expect((await POST(request({ category: "general", email: "reader@example.com", message: "A valid message that is long enough.", extra: "nope" }))).status).toBe(400);
    expect((await POST(request({ category: "general", email: "reader@example.com", message: "A valid message that is long enough." }, "https://evil.example"))).status).toBe(403);
    expect(mocks.query.insert).not.toHaveBeenCalled();
  });

  test("silently accepts the honeypot while discarding the spam", async () => {
    const response = await POST(request({ category: "general", email: "bot@example.com", message: "A bot has filled this field with enough text.", website: "https://spam.example" }));
    expect(response.status).toBe(202);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.query.insert).not.toHaveBeenCalled();
    expect(mocks.deliverContactInquiry).not.toHaveBeenCalled();
  });

  test("returns a retryable response for rate limiting or unavailable storage", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, unavailable: false });
    expect((await POST(request({ category: "support", email: "reader@example.com", message: "I need help with my account today." }))).status).toBe(429);

    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, unavailable: true });
    expect((await POST(request({ category: "support", email: "reader@example.com", message: "I need help with my account today." }))).status).toBe(503);
  });
});
