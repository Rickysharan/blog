import { cookies } from "next/headers";

import { requireStudioOperator } from "../../../../../lib/auth/operator";
import { openToken, type SealedToken } from "../../../../../lib/crypto/token-vault";
import { parseGoogleOAuthEnv } from "../../../../../lib/env";
import { persistGoogleCredentials } from "../../../../../lib/google/connections";
import { exchangeAuthorizationCode, GOOGLE_OAUTH_TRANSACTION_COOKIE, verifyOAuthTransaction, type OAuthTransaction } from "../../../../../lib/google/oauth";

export const dynamic = "force-dynamic";

function destination(redirectUri: string, query: string) {
  return new URL(`/settings/connections?${query}`, new URL(redirectUri).origin);
}

export async function GET(request: Request) {
  let redirectUri = new URL("/api/connections/google/callback", request.url).toString();
  try {
    const identity = await requireStudioOperator();
    const config = parseGoogleOAuthEnv();
    redirectUri = config.redirectUri;
    const cookieStore = await cookies();
    const transactionCookie = cookieStore.get(GOOGLE_OAUTH_TRANSACTION_COOKIE);
    cookieStore.delete(GOOGLE_OAUTH_TRANSACTION_COOKIE);
    if (!transactionCookie) return Response.redirect(destination(redirectUri, "error=verification"), 307);

    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (url.searchParams.has("error") || !code || !state) return Response.redirect(destination(redirectUri, "error=verification"), 307);
    let transaction: OAuthTransaction;
    try {
      transaction = JSON.parse(openToken(JSON.parse(transactionCookie.value) as SealedToken, config.encryptionKey)) as OAuthTransaction;
      verifyOAuthTransaction(transaction, state);
    } catch {
      return Response.redirect(destination(redirectUri, "error=verification"), 307);
    }
    const credentials = await exchangeAuthorizationCode({ code, verifier: transaction.verifier, nonce: transaction.nonce, config });
    if (credentials.email.trim().toLowerCase() !== identity.email.trim().toLowerCase() ||
        credentials.email.trim().toLowerCase() !== config.operatorEmail.trim().toLowerCase()) {
      return Response.redirect(destination(redirectUri, "error=identity"), 307);
    }
    await persistGoogleCredentials(credentials, config.encryptionKey);
    return Response.redirect(destination(redirectUri, "connected=1"), 307);
  } catch {
    return Response.redirect(destination(redirectUri, "error=verification"), 307);
  }
}
