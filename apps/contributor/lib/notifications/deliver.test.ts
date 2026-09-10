import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const events: string[] = [];
  const query = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn()
  };
  const service = {
    from: vi.fn(() => query),
    auth: { admin: { getUserById: vi.fn() } }
  };
  const brevoSend = vi.fn();
  return { events, query, service, brevoSend };
});

vi.mock("../supabase/server", () => ({ createServiceSupabaseClient: vi.fn(() => mocks.service) }));
vi.mock("../providers/brevo", () => ({
  BrevoProvider: class {
    send = mocks.brevoSend;
  }
}));

import { deliverNotification, queueNotification } from "./deliver";

const notification = {
  id: "00000000-0000-4000-8000-000000000010",
  user_id: "00000000-0000-4000-8000-000000000001",
  kind: "review.updated",
  title: "Your story has an update",
  body: "A reviewer left a note.",
  email_state: "pending"
};

describe("notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    process.env.BREVO_API_KEY = "brevo-test-key";
    process.env.BREVO_SENDER_EMAIL = "desk@example.com";
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.insert.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.single.mockResolvedValue({ data: { id: notification.id }, error: null });
    mocks.query.maybeSingle.mockResolvedValue({ data: notification, error: null });
    mocks.query.update.mockImplementation(() => {
      mocks.events.push("state-update");
      return mocks.query;
    });
    mocks.service.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "writer@example.com" } }, error: null });
    mocks.brevoSend.mockImplementation(async () => {
      mocks.events.push("email");
      return { messageId: "message-id" };
    });
  });

  test("commits the in-app notification before delivery and queues pending state", async () => {
    const id = await queueNotification({ userId: notification.user_id, kind: notification.kind, title: notification.title, body: notification.body });
    expect(id).toBe(notification.id);
    expect(mocks.query.insert).toHaveBeenCalledWith({
      user_id: notification.user_id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      email_state: "pending"
    });
    expect(mocks.query.select).toHaveBeenCalledWith("id");
  });

  test("marks successful email delivery only after the provider resolves", async () => {
    await expect(deliverNotification(notification.id)).resolves.toBe("sent");
    expect(mocks.events).toEqual(["email", "state-update"]);
    expect(mocks.query.update).toHaveBeenCalledWith({ email_state: "sent" });
  });

  test("keeps provider failures retryable and visible", async () => {
    mocks.brevoSend.mockRejectedValue(new Error("quota exhausted"));
    await expect(deliverNotification(notification.id)).resolves.toBe("retryable");
    expect(mocks.query.update).toHaveBeenCalledWith({ email_state: "retryable" });
    expect(mocks.events).toEqual(["state-update"]);
  });

  test("disables email without losing the in-app notice when Brevo is not configured", async () => {
    delete process.env.BREVO_API_KEY;
    await expect(deliverNotification(notification.id)).resolves.toBe("disabled");
    expect(mocks.query.update).toHaveBeenCalledWith({ email_state: "disabled" });
    expect(mocks.brevoSend).not.toHaveBeenCalled();
  });

  test("does not resend an already-delivered notification", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { ...notification, email_state: "sent" }, error: null });
    await expect(deliverNotification(notification.id)).resolves.toBe("already_sent");
    expect(mocks.brevoSend).not.toHaveBeenCalled();
    expect(mocks.query.update).not.toHaveBeenCalled();
  });
});
