import { describe, expect, test } from "vitest";

import {
  AuthorizationError,
  authorize,
  type AuthorizationGateway,
  type ClaimsResult,
  type RolesResult
} from "./authorization";

const userId = "00000000-0000-4000-8000-000000000001";

function gateway(
  claims: ClaimsResult,
  roles: Omit<RolesResult, "accountStatus"> & Partial<Pick<RolesResult, "accountStatus">> = {
    roles: ["contributor"],
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

describe("contributor authorization", () => {
  test("rejects missing or invalid verified claims", async () => {
    await expect(authorize(gateway({ claims: null, error: null })).requireIdentity()).rejects.toBeInstanceOf(
      AuthorizationError
    );
    await expect(
      authorize(
        gateway({
          claims: { sub: "not-a-uuid", email: "writer@example.com", aal: "aal1" },
          error: null
        })
      ).requireIdentity()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("queries fresh database roles and ignores user metadata", async () => {
    const result = await authorize(
      gateway({
        claims: {
          sub: userId,
          email: "writer@example.com",
          aal: "aal1",
          user_metadata: { role: "admin" }
        },
        error: null
      }, { roles: ["contributor"], error: null })
    ).requireIdentity();

    expect(result).toEqual({ userId, email: "writer@example.com", aal: "aal1", roles: ["contributor"] });
  });

  test("requires reviewer or admin for reviewer routes", async () => {
    await expect(authorize(gateway(validClaims())).requireReviewer()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      authorize(gateway(validClaims(), { roles: ["reviewer"], error: null })).requireReviewer()
    ).resolves.toMatchObject({ roles: ["reviewer"] });
  });

  test("requires admin for admin routes", async () => {
    await expect(
      authorize(gateway(validClaims(), { roles: ["reviewer"], error: null })).requireAdmin()
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      authorize(gateway(validClaims(), { roles: ["admin"], error: null })).requireAdmin()
    ).resolves.toMatchObject({ roles: ["admin"] });
  });

  test("surfaces a role-query failure instead of granting access", async () => {
    await expect(
      authorize(gateway(validClaims(), { roles: [], error: new Error("database unavailable") })).requireIdentity()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("rejects suspended accounts even when roles are present", async () => {
    await expect(
      authorize(gateway(validClaims(), { roles: ["admin"], accountStatus: "suspended", error: null })).requireIdentity()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

function validClaims(): ClaimsResult {
  return { claims: { sub: userId, email: "writer@example.com", aal: "aal1" }, error: null };
}
