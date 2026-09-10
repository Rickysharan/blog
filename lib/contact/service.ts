import "server-only";

import { createHmac } from "node:crypto";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const inquiryTypes = ["general", "support", "advertising", "partnership"] as const;

export const contactPayloadSchema = z
  .object({
    inquiryType: z.enum(inquiryTypes),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    organisation: z.string().trim().max(160),
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(20).max(5000),
    website: z.string().max(300),
    submissionKey: z.string().uuid(),
  })
  .strict();

export type ContactInput = z.infer<typeof contactPayloadSchema>;
export type ContactAudience = "editorial" | "commercial";

export type StoredContact = {
  inquiryId: string;
  created: boolean;
};

export type ContactNotification = ContactInput & {
  audience: ContactAudience;
  inquiryId: string;
};

export interface ContactDependencies {
  store(input: ContactInput, identityHash: string): Promise<StoredContact>;
  notify(input: ContactNotification): Promise<void>;
  markNotification(input: {
    inquiryId: string;
    submissionKey: string;
    state: "sent" | "failed";
    errorCode?: string;
  }): Promise<void>;
}

type ContactResult = {
  status: number;
  body: {
    ok: boolean;
    code: string;
    message: string;
    referenceId?: string;
    notification?: "sent" | "failed" | "pending" | "duplicate";
  };
};

type ContactStoreErrorCode = "rate_limited" | "unavailable";

export class ContactStoreError extends Error {
  constructor(readonly code: ContactStoreErrorCode) {
    super(code);
    this.name = "ContactStoreError";
  }
}

class NotificationDeliveryError extends Error {
  constructor(readonly code: "notification_not_configured" | "notification_failed") {
    super(code);
    this.name = "NotificationDeliveryError";
  }
}

function audienceFor(inquiryType: ContactInput["inquiryType"]): ContactAudience {
  return inquiryType === "advertising" || inquiryType === "partnership"
    ? "commercial"
    : "editorial";
}

export function hashContactIdentity(identity: string, secret: string): string {
  if (secret.length < 32) {
    throw new Error("CONTACT_RATE_LIMIT_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", secret)
    .update(identity.trim().toLowerCase() || "unknown", "utf8")
    .digest("hex");
}

export async function processContactPayload(
  payload: unknown,
  context: { identityHash: string },
  dependencies: ContactDependencies,
): Promise<ContactResult> {
  const parsed = contactPayloadSchema.safeParse(payload);
  if (!parsed.success || !/^[0-9a-f]{64}$/.test(context.identityHash)) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "invalid_request",
        message: "Check the highlighted fields and try again.",
      },
    };
  }

  const input = parsed.data;
  if (input.website.trim()) {
    return {
      status: 202,
      body: {
        ok: true,
        code: "accepted",
        message: "Your enquiry was accepted.",
      },
    };
  }

  let stored: StoredContact;
  try {
    stored = await dependencies.store(input, context.identityHash);
  } catch (error) {
    if (error instanceof ContactStoreError && error.code === "rate_limited") {
      return {
        status: 429,
        body: {
          ok: false,
          code: "rate_limited",
          message: "Too many enquiries were sent recently. Please try again later.",
        },
      };
    }

    return {
      status: 503,
      body: {
        ok: false,
        code: "storage_unavailable",
        message: "We could not safely save your enquiry. Please retry in a few minutes.",
      },
    };
  }

  if (!stored.created) {
    return {
      status: 202,
      body: {
        ok: true,
        code: "already_received",
        message: "This enquiry was already saved for review.",
        referenceId: stored.inquiryId,
        notification: "duplicate",
      },
    };
  }

  const notification = {
    ...input,
    audience: audienceFor(input.inquiryType),
    inquiryId: stored.inquiryId,
  };

  try {
    await dependencies.notify(notification);
  } catch (error) {
    const errorCode = error instanceof NotificationDeliveryError
      ? error.code
      : "notification_failed";
    try {
      await dependencies.markNotification({
        inquiryId: stored.inquiryId,
        submissionKey: input.submissionKey,
        state: "failed",
        errorCode,
      });
    } catch {
      // The enquiry remains pending and visible in Supabase for reconciliation.
    }

    return {
      status: 202,
      body: {
        ok: true,
        code: "stored_notification_failed",
        message: "Your enquiry was saved for review. Email notification is delayed.",
        referenceId: stored.inquiryId,
        notification: "failed",
      },
    };
  }

  try {
    await dependencies.markNotification({
      inquiryId: stored.inquiryId,
      submissionKey: input.submissionKey,
      state: "sent",
    });
  } catch {
    return {
      status: 202,
      body: {
        ok: true,
        code: "stored_notification_pending",
        message: "Your enquiry was saved for review.",
        referenceId: stored.inquiryId,
        notification: "pending",
      },
    };
  }

  return {
    status: 201,
    body: {
      ok: true,
      code: "stored",
      message: "Your enquiry was saved for review.",
      referenceId: stored.inquiryId,
      notification: "sent",
    },
  };
}

type Environment = Record<string, string | undefined>;

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function recipientFor(
  input: ContactNotification,
  environment: Environment,
): string | undefined {
  const editorial = optionalValue(
    environment.CONTACT_NOTIFICATION_TO ?? environment.NEXT_PUBLIC_CONTACT_EMAIL,
  );
  return input.audience === "commercial"
    ? optionalValue(environment.CONTACT_COMMERCIAL_NOTIFICATION_TO) ?? editorial
    : editorial;
}

export function createContactDependencies(
  environment: Environment = process.env,
  fetcher: typeof fetch = fetch,
): ContactDependencies {
  const client = createSupabaseAdminClient(environment);

  return {
    async store(input, identityHash) {
      const { data, error } = await client.rpc("submit_contact_inquiry", {
        p_source_site: "blog",
        p_inquiry_type: input.inquiryType,
        p_sender_name: input.name,
        p_sender_email: input.email,
        p_organisation: input.organisation || null,
        p_subject: input.subject,
        p_message: input.message,
        p_identity_hash: identityHash,
        p_idempotency_key: input.submissionKey,
      });

      if (error) {
        if (error.message.includes("contact_rate_limited")) {
          throw new ContactStoreError("rate_limited");
        }
        throw new ContactStoreError("unavailable");
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.inquiry_id !== "string" ||
        typeof row.created !== "boolean"
      ) {
        throw new ContactStoreError("unavailable");
      }

      return { inquiryId: row.inquiry_id, created: row.created };
    },

    async notify(input) {
      const apiKey = optionalValue(environment.BREVO_API_KEY);
      const senderEmail = optionalValue(environment.BREVO_SENDER_EMAIL);
      const recipient = recipientFor(input, environment);
      if (!apiKey || !senderEmail || !recipient) {
        throw new NotificationDeliveryError("notification_not_configured");
      }

      const response = await fetcher("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: senderEmail,
            name: optionalValue(environment.BREVO_SENDER_NAME) ?? "OmniLede",
          },
          to: [{ email: recipient }],
          replyTo: { email: input.email, name: input.name },
          subject: `[OmniLede ${input.inquiryType}] ${input.subject}`,
          textContent: [
            `Reference: ${input.inquiryId}`,
            `Type: ${input.inquiryType}`,
            `Name: ${input.name}`,
            `Email: ${input.email}`,
            `Organisation: ${input.organisation || "Not supplied"}`,
            "",
            input.message,
          ].join("\n"),
          tags: ["omnilede-contact", `audience-${input.audience}`],
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        throw new NotificationDeliveryError("notification_failed");
      }
    },

    async markNotification({ inquiryId, submissionKey, state, errorCode }) {
      const { data, error } = await client.rpc("mark_contact_notification", {
        p_inquiry_id: inquiryId,
        p_idempotency_key: submissionKey,
        p_delivery_state: state,
        p_error_code: errorCode ?? null,
      });
      if (error || data !== true) {
        throw new Error("contact_notification_state_not_saved");
      }
    },
  };
}
