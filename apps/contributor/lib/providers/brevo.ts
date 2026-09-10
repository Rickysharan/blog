import { fetchJson } from "./http";
import { ProviderError } from "./types";

export type TransactionalEmail = { sender: { email: string; name?: string }; to: readonly { email: string; name?: string }[]; subject: string; textContent: string };

export class BrevoProvider {
  constructor(private readonly apiKey: string) {}

  async send(email: TransactionalEmail): Promise<{ messageId: string | null }> {
    if (email.to.length < 1 || email.to.length > 10 || email.textContent.length > 10_000) throw new ProviderError("email_payload_invalid", "disabled", false);
    const response = await fetchJson("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": this.apiKey, "content-type": "application/json" }, body: JSON.stringify(email), retry: false });
    const messageId = response && typeof response === "object" && typeof (response as { messageId?: unknown }).messageId === "string" ? (response as { messageId: string }).messageId : null;
    return { messageId };
  }
}
