import "server-only";

import { BrevoProvider } from "../providers/brevo";
import { createServiceSupabaseClient } from "../supabase/server";

export type NotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body: string;
};

type NotificationRow = NotificationInput & {
  id: string;
  email_state: "pending" | "sent" | "retryable" | "disabled";
};

export async function queueNotification(input: NotificationInput): Promise<string> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("notifications")
    .insert({ user_id: input.userId, kind: input.kind, title: input.title, body: input.body, email_state: "pending" })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error("Unable to queue notification", { cause: error });
  return data.id as string;
}

async function setEmailState(notificationId: string, emailState: NotificationRow["email_state"]): Promise<void> {
  const { error } = await createServiceSupabaseClient().from("notifications").update({ email_state: emailState }).eq("id", notificationId);
  if (error) throw new Error("Unable to update notification delivery state", { cause: error });
}

export async function deliverNotification(notificationId: string): Promise<"sent" | "retryable" | "disabled" | "already_sent"> {
  const service = createServiceSupabaseClient();
  const { data: notification, error } = await service.from("notifications").select("id,user_id,kind,title,body,email_state").eq("id", notificationId).maybeSingle();
  if (error) throw new Error("Unable to load notification", { cause: error });
  if (!notification) throw new Error("Notification not found");
  if (notification.email_state === "sent") return "already_sent";
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    await setEmailState(notificationId, "disabled");
    return "disabled";
  }
  const { data: user } = await service.auth.admin.getUserById(notification.user_id);
  const email = user.user?.email;
  if (!email) {
    await setEmailState(notificationId, "disabled");
    return "disabled";
  }
  try {
    await new BrevoProvider(apiKey).send({ sender: { email: process.env.BREVO_SENDER_EMAIL ?? "notifications@omnilede.example", name: "OmniLede" }, to: [{ email }], subject: notification.title, textContent: notification.body.slice(0, 2_000) });
    await setEmailState(notificationId, "sent");
    return "sent";
  } catch {
    await setEmailState(notificationId, "retryable");
    return "retryable";
  }
}
