export type OtpErrorState = "cooldown" | "unavailable";

export function classifyOtpError(error: unknown): OtpErrorState {
  if (!error || typeof error !== "object") return "unavailable";
  const record = error as { code?: unknown; status?: unknown };
  return record.code === "over_email_send_rate_limit" || record.status === 429
    ? "cooldown"
    : "unavailable";
}
