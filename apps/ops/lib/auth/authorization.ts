import "server-only";

import { roleSchema, type Role } from "@omnilede/contracts";
import { z } from "zod";

const claimsSchema = z
  .object({
    sub: z.string().uuid(),
    email: z.string().email(),
    aal: z.enum(["aal1", "aal2"])
  })
  .passthrough();

export type ClaimsResult = {
  claims: Record<string, unknown> | null;
  error: Error | null;
};

export type RolesResult = {
  roles: readonly Role[];
  accountStatus: "active" | "suspended" | "banned" | null;
  error: Error | null;
};

export type AuthorizationGateway = {
  getClaims: () => Promise<ClaimsResult>;
  getRoles: (userId: string) => Promise<RolesResult>;
};

export type VerifiedIdentity = {
  userId: string;
  email: string;
  aal: "aal1" | "aal2";
  roles: readonly Role[];
};

export class AuthorizationError extends Error {
  override name = "AuthorizationError";
}

async function resolveIdentity(gateway: AuthorizationGateway): Promise<VerifiedIdentity> {
  let claimsResult: ClaimsResult;
  try {
    claimsResult = await gateway.getClaims();
  } catch (error) {
    throw new AuthorizationError("Unable to verify the current session", { cause: error });
  }
  if (claimsResult.error || !claimsResult.claims) {
    throw new AuthorizationError("Unable to verify the current session", { cause: claimsResult.error });
  }
  const claims = claimsSchema.safeParse(claimsResult.claims);
  if (!claims.success) throw new AuthorizationError("Verified claims are invalid");

  let rolesResult: RolesResult;
  try {
    rolesResult = await gateway.getRoles(claims.data.sub);
  } catch (error) {
    throw new AuthorizationError("Unable to load account roles", { cause: error });
  }
  if (rolesResult.error) {
    throw new AuthorizationError("Unable to load account roles", { cause: rolesResult.error });
  }
  if (rolesResult.accountStatus !== "active") throw new AuthorizationError("Account is not active");
  const roles = [...new Set(rolesResult.roles)].filter((role): role is Role => roleSchema.safeParse(role).success);
  if (roles.length !== rolesResult.roles.length) throw new AuthorizationError("Account roles are invalid");
  return { userId: claims.data.sub, email: claims.data.email, aal: claims.data.aal, roles };
}

async function defaultGateway(): Promise<AuthorizationGateway> {
  const { createServerSupabaseClient, createServiceSupabaseClient } = await import("../supabase/server");
  const supabase = await createServerSupabaseClient();
  const serviceSupabase = createServiceSupabaseClient();
  return {
    async getClaims() {
      const { data, error } = await supabase.auth.getClaims();
      return { claims: (data?.claims as Record<string, unknown> | undefined) ?? null, error };
    },
    async getRoles(userId) {
      const [{ data: roleRows, error: rolesError }, { data: profile, error: profileError }] = await Promise.all([
        serviceSupabase.from("roles").select("role").eq("user_id", userId),
        serviceSupabase.from("profiles").select("account_status").eq("id", userId).maybeSingle()
      ]);
      return {
        roles: (roleRows ?? []).map((row) => row.role as Role),
        accountStatus: (profile?.account_status as RolesResult["accountStatus"]) ?? null,
        error: rolesError ?? profileError
      };
    }
  };
}

export function authorize(gateway: AuthorizationGateway) {
  return {
    requireIdentity: () => resolveIdentity(gateway),
    async requireReviewer() {
      const identity = await resolveIdentity(gateway);
      if (!identity.roles.includes("reviewer") && !identity.roles.includes("admin")) {
        throw new AuthorizationError("Reviewer access required");
      }
      return identity;
    },
    async requireAdmin(options?: { requireMfa?: boolean }) {
      void options;
      const identity = await resolveIdentity(gateway);
      if (!identity.roles.includes("admin")) throw new AuthorizationError("Administrator access required");
      if (identity.aal !== "aal2") {
        throw new AuthorizationError("Multi-factor authentication required");
      }
      return identity;
    }
  };
}

export async function requireIdentity(): Promise<VerifiedIdentity> {
  return authorize(await defaultGateway()).requireIdentity();
}

export async function requireReviewer(): Promise<VerifiedIdentity> {
  return authorize(await defaultGateway()).requireReviewer();
}

export async function requireAdmin(options?: { requireMfa?: boolean }): Promise<VerifiedIdentity> {
  return authorize(await defaultGateway()).requireAdmin(options);
}
