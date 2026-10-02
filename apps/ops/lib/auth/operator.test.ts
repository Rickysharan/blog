import { describe, expect, test } from "vitest";

import {
  AuthorizationError,
  authorize,
  type AuthorizationGateway,
  type ClaimsResult,
  type RolesResult
} from "./authorization";
import { createStudioOperatorAuthorizer } from "./operator";

const userId = "00000000-0000-4000-8000-000000000002";
const operatorEmail = "operator@example.com";

function gateway(
  claims: ClaimsResult = { claims: { sub: userId, email: operatorEmail, aal: "aal1" }, error: null },
  roles: RolesResult = { roles: ["admin"], accountStatus: "active", error: null }
): AuthorizationGateway {
  return {
    async getClaims() {
      return claims;
    },
    async getRoles() {
      return roles;
    }
  };
}

function studioAuthorizer(
  claims?: ClaimsResult,
  roles?: RolesResult,
  configuredEmail = operatorEmail
) {
  return createStudioOperatorAuthorizer(authorize(gateway(claims, roles)).requireIdentity, configuredEmail);
}

describe("Studio operator authorization", () => {
  test("rejects an anonymous session", async () => {
    await expect(studioAuthorizer({ claims: null, error: null })()).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("rejects a suspended configured administrator", async () => {
    await expect(
      studioAuthorizer(undefined, { roles: ["admin"], accountStatus: "suspended", error: null })()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("rejects an active user without the server-managed administrator role", async () => {
    await expect(
      studioAuthorizer(undefined, { roles: ["reviewer"], accountStatus: "active", error: null })()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("rejects an administrator whose verified email is not the configured operator", async () => {
    await expect(
      studioAuthorizer({ claims: { sub: userId, email: "other@example.com", aal: "aal2" }, error: null })()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("does not grant access from forged user metadata", async () => {
    await expect(
      studioAuthorizer(
        {
          claims: {
            sub: userId,
            email: operatorEmail,
            aal: "aal2",
            user_metadata: { role: "admin", email: operatorEmail }
          },
          error: null
        },
        { roles: ["contributor"], accountStatus: "active", error: null }
      )()
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test("accepts only the configured email case-insensitively with an active server role", async () => {
    await expect(
      studioAuthorizer({ claims: { sub: userId, email: "Operator@Example.COM", aal: "aal1" }, error: null })()
    ).resolves.toEqual({
      userId,
      email: "Operator@Example.COM",
      aal: "aal1",
      roles: ["admin"]
    });
  });
});
