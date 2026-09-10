import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseSupabaseAdminEnv } from "@omnilede/config";

type Environment = Record<string, string | undefined>;

/** Creates a new server-only admin client for the current request; it is never a module singleton. */
export function createSupabaseAdminClient(environment: Environment = process.env): SupabaseClient {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey } = parseSupabaseAdminEnv(environment);

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
