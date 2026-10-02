import "server-only";

import { AuthorizationError, requireIdentity, type VerifiedIdentity } from "./authorization";
import { parseStudioOperatorEnv } from "../env";

type IdentityReader = () => Promise<VerifiedIdentity>;

export function createStudioOperatorAuthorizer(
  readIdentity: IdentityReader,
  configuredEmail: string
): () => Promise<VerifiedIdentity> {
  const allowedEmail = configuredEmail.trim().toLowerCase();

  return async () => {
    const identity = await readIdentity();
    if (!allowedEmail || identity.email.trim().toLowerCase() !== allowedEmail) {
      throw new AuthorizationError("Studio operator access required");
    }
    if (!identity.roles.includes("admin")) {
      throw new AuthorizationError("Studio operator access required");
    }
    return identity;
  };
}

export async function requireStudioOperator(): Promise<VerifiedIdentity> {
  let configuredEmail: string;
  try {
    configuredEmail = parseStudioOperatorEnv({
      STUDIO_OPERATOR_EMAIL: process.env.STUDIO_OPERATOR_EMAIL
    }).STUDIO_OPERATOR_EMAIL;
  } catch (error) {
    throw new AuthorizationError("Studio authorization is unavailable", { cause: error });
  }

  return createStudioOperatorAuthorizer(requireIdentity, configuredEmail)();
}
