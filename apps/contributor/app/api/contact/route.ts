import { z } from "zod";

import { jsonAuthResponse, rejectOrigin, unavailableResponse } from "../../../lib/auth/http";
import { parseInput } from "../../../lib/auth/input";
import { consumeAuthRateLimit } from "../../../lib/auth/rate-limit";
import { deliverContactInquiry } from "../../../lib/notifications/contact-deliver";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";

const contactSchema = z.object({ category: z.enum(["general", "support", "advertising", "partnership"]), email: z.string().trim().toLowerCase().email().max(320), message: z.string().trim().min(10).max(10_000), website: z.string().max(200).optional() }).strict();

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectOrigin(request);
  if (originError) return originError;
  let input: z.infer<typeof contactSchema>;
  try { input = await parseInput(request, contactSchema, "Invalid contact form"); } catch (error) { return jsonAuthResponse({ error: error instanceof Error ? error.message : "Invalid contact form" }, 400); }
  if (input.website) return jsonAuthResponse({ ok: true, message: "Thanks — your note is queued." }, 202);
  try {
    const service = createServiceSupabaseClient();
    const limit = await consumeAuthRateLimit(service, `contact.${input.category}`, input.email, 3, 86_400);
    if (limit.unavailable) return unavailableResponse();
    if (!limit.allowed) return jsonAuthResponse({ error: "Too many messages. Try again tomorrow." }, 429);
    const { data, error } = await service.from("contact_inquiries").insert({ sender_email: input.email, message: `[${input.category}] ${input.message}`, delivery_state: "pending", moderation_state: "unreviewed" }).select("id").single();
    if (error || !data?.id) return unavailableResponse();
    try { await deliverContactInquiry(data.id as string); } catch { /* The stored inquiry remains visible for admin follow-up. */ }
    return jsonAuthResponse({ ok: true, message: "Thanks — your note is queued for a response." }, 201);
  } catch { return unavailableResponse(); }
}
