import { createHash } from "node:crypto";

type RateLimitClient = {
  schema: (schema: string) => {
    rpc: (
      functionName: string,
      args: Record<string, unknown>
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
};

export type RateLimitResult = { allowed: boolean; unavailable: boolean };

export async function consumeAuthRateLimit(
  client: RateLimitClient,
  route: string,
  email: string,
  maxRequests = 8,
  windowSeconds = 3600
): Promise<RateLimitResult> {
  const salt = process.env.AUTH_RATE_LIMIT_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "local-development-salt";
  const digest = createHash("sha256").update(`${salt}:${route}:${email}`).digest("hex");
  const result = await client.schema("app_private").rpc("consume_rate_limit", {
    p_bucket_key: `${route}:${digest}`,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds
  });
  if (result.error || result.data === null) return { allowed: false, unavailable: true };
  return { allowed: result.data, unavailable: false };
}
