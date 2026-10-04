import { cookies } from "next/headers";

import { requireStudioOperator } from "../../../../../lib/auth/operator";
import { openToken, type SealedToken } from "../../../../../lib/crypto/token-vault";
import { parseGoogleOAuthEnv } from "../../../../../lib/env";
import { persistGoogleCredentials } from "../../../../../lib/google/connections";
import { exchangeAuthorizationCode, GOOGLE_OAUTH_TRANSACTION_COOKIE, verifyOAuthTransaction, type OAuthTransaction } from "../../../../../lib/google/oauth";

export const dynamic = "force-dynamic";

function destination(studioOrigin: string, query: string) {
  return new URL(`/settings/connections?${query}`, studioOrigin);
}

export async function GET(request: Request) {
  let studioOrigin = "https://invalid.local";
  try {
    const config = parseGoogleOAuthEnv();
    studioOrigin = config.studioOrigin;
    if (new URL(request.url).origin !== studioOrigin) return Response.redirect(destination(studioOrigin, "error=verification"), 307);
    const identity = await requireStudioOperator();
    const cookieStore = await cookies();
    const transactionCookie = cookieStore.get(GOOGLE_OAUTH_TRANSACTION_COOKIE);
    cookieStore.delete(GOOGLE_OAUTH_TRANSACTION_COOKIE);
    if (!transactionCookie) return Response.redirect(destination(studioOrigin, "error=verification"), 307);

    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (url.searchParams.has("error") || !code || !state) return Response.redirect(destination(studioOrigin, "error=verification"), 307);
    let transaction: OAuthTransaction;
    try {
      transaction = JSON.parse(openToken(JSON.parse(transactionCookie.value) as SealedToken, config.encryptionKey)) as OAuthTransaction;
      verifyOAuthTransaction(transaction, state);
    } catch {
      return Response.redirect(destination(studioOrigin, "error=verification"), 307);
    }
    const credentials = await exchangeAuthorizationCode({ code, verifier: transaction.verifier, nonce: transaction.nonce, config });
    if (credentials.email.trim().toLowerCase() !== identity.email.trim().toLowerCase() ||
        credentials.email.trim().toLowerCase() !== config.operatorEmail.trim().toLowerCase()) {
      return Response.redirect(destination(studioOrigin, "error=identity"), 307);
    }
    await persistGoogleCredentials(credentials, config.encryptionKey);
    return Response.redirect(destination(studioOrigin, "connected=1"), 307);
  } catch {
    return Response.redirect(destination(studioOrigin, "error=verification"), 307);
  }
}
