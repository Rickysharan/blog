import "server-only";

import { BrevoProvider } from "../providers/brevo";
import { createServiceSupabaseClient } from "../supabase/server";

type ContactRow = {
  id: string;
  sender_email: string;
  message: string;
  delivery_state: "pending" | "sent" | "failed";
};

export async function deliverContactInquiry(inquiryId: string): Promise<"sent" | "failed" | "already_sent"> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service.from("contact_inquiries").select("id,sender_email,message,delivery_state").eq("id", inquiryId).maybeSingle();
  const inquiry = data as ContactRow | null;
  if (error) throw new Error("Unable to load contact enquiry", { cause: error });
  if (!inquiry) throw new Error("Contact enquiry not found");
  if (inquiry.delivery_state === "sent") return "already_sent";

  const apiKey = process.env.BREVO_API_KEY;
  const recipient = process.env.CONTACT_INBOX_EMAIL;
  if (!apiKey || !recipient) {
    await markContactState(service, inquiryId, "failed");
    return "failed";
  }

  try {
    await new BrevoProvider(apiKey).send({
      sender: { email: process.env.BREVO_SENDER_EMAIL ?? "notifications@omnilede.example", name: "OmniLede contact desk" },
      to: [{ email: recipient }],
      subject: "New OmniLede contact enquiry",
      textContent: `From: ${inquiry.sender_email}\n\n${inquiry.message.slice(0, 9_500)}`
    });
    await markContactState(service, inquiryId, "sent");
    return "sent";
  } catch {
    await markContactState(service, inquiryId, "failed");
    return "failed";
  }
}

async function markContactState(service: ReturnType<typeof createServiceSupabaseClient>, inquiryId: string, state: ContactRow["delivery_state"]): Promise<void> {
  const { error } = await service.from("contact_inquiries").update({ delivery_state: state }).eq("id", inquiryId);
  if (error) throw new Error("Unable to update contact delivery state", { cause: error });
}
