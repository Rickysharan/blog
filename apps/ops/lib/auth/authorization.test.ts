import { describe, expect, test } from "vitest";

import {
  AuthorizationError,
  authorize,
  type AuthorizationGateway,
  type ClaimsResult,
  type RolesResult
} from "./authorization";

const userId = "00000000-0000-4000-8000-000000000002";

function gateway(
  claims: ClaimsResult = { claims: { sub: userId, email: "operator@example.com", aal: "aal2" }, error: null },
  roles: Omit<RolesResult, "accountStatus"> & Partial<Pick<RolesResult, "accountStatus">> = {
    roles: ["admin"],
    error: null
  }
): AuthorizationGateway {
  const resolvedRoles: RolesResult = { accountStatus: "active", ...roles };
  return {
    async getClaims() {
      return claims;
    },
    async getRoles() {
      return resolvedRoles;
    }
  };
}

describe("operations authorization", () => {
  test("rejects missing claims before querying roles", async () => {
    await expect(
      authorize({
        async getClaims() {
          return { claims: null, error: null };
        },
        async getRoles() {
          throw new Error("must not query roles");
        }
      }).requireIdentity()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("ignores admin claims in user metadata", async () => {
    await expect(
      authorize(
        gateway({
          claims: { sub: userId, email: "operator@example.com", aal: "aal2", user_metadata: { role: "admin" } },
          error: null
        }, { roles: ["contributor"], error: null })
      ).requireAdmin()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("does not allow a reviewer into admin-only operations", async () => {
    await expect(authorize(gateway(undefined, { roles: ["reviewer"], error: null })).requireAdmin()).rejects.toBeInstanceOf(
      AuthorizationError
    );
  });

  test("requires aal2 for Ops admin access", async () => {
    await expect(
      authorize(gateway({ claims: { sub: userId, email: "operator@example.com", aal: "aal1" }, error: null })).requireAdmin()
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(authorize(gateway()).requireAdmin()).resolves.toMatchObject({ aal: "aal2", roles: ["admin"] });
    await expect(
      authorize(gateway({ claims: { sub: userId, email: "operator@example.com", aal: "aal1" }, error: null })).requireAdmin({ requireMfa: false })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("returns only shaped verified identity fields", async () => {
    const identity = await authorize(
      gateway({ claims: { sub: userId, email: "operator@example.com", aal: "aal2", role: "admin" }, error: null })
    ).requireIdentity();
    expect(identity).toEqual({ userId, email: "operator@example.com", aal: "aal2", roles: ["admin"] });
  });

  test("rejects suspended admins before granting Ops access", async () => {
    await expect(
      authorize(gateway(undefined, { roles: ["admin"], accountStatus: "suspended", error: null })).requireAdmin()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
