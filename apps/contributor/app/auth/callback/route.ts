import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "../../../lib/supabase/server";
import { safeNext } from "../../../lib/auth/safe-next";

export const dynamic = "force-dynamic";

function redirectToLogin(request: Request, reason: string): NextResponse {
  const target = new URL("/login", request.url);
  target.searchParams.set("error", reason);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) return redirectToLogin(request, "invalid_callback");
  const next = safeNext(url.searchParams.get("next"), request);

  try {
    const { error } = await (await createServerSupabaseClient()).auth.exchangeCodeForSession(code);
    if (error) return redirectToLogin(request, "invalid_callback");
  } catch {
    return redirectToLogin(request, "invalid_callback");
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
