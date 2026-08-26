import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPassword } from "@/lib/auth/password";
import { assertSameOrigin, readBoundedJson, RequestGuardError } from "@/lib/auth/request";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
} from "@/lib/auth/session";
import {
  checkLoginThrottle,
  clearLoginThrottle,
  hashThrottleKey,
  recordLoginFailure,
} from "@/lib/auth/throttle";

export const runtime = "nodejs";

const loginSchema = z.object({ password: z.string().min(1).max(512) }).strict();

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "no-store");
  return response;
}

function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-client"
  ).slice(0, 200);
}

function errorResponse(message: string, status: number): NextResponse {
  return noStore(NextResponse.json({ error: message }, { status }));
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const configuredPassword = process.env.ADMIN_PASSWORD;
    const sessionSecret = process.env.ADMIN_SESSION_SECRET;
    if (
      !configuredPassword ||
      configuredPassword.length < 12 ||
      !sessionSecret ||
      sessionSecret.length < 32
    ) {
      return errorResponse("Admin authentication is not configured", 503);
    }

    const key = hashThrottleKey(clientAddress(request), sessionSecret);
    const throttle = checkLoginThrottle(key);
    if (!throttle.allowed) {
      const response = errorResponse("Too many sign-in attempts", 429);
      response.headers.set("retry-after", String(throttle.retryAfterSeconds));
      return response;
    }

    const parsed = loginSchema.safeParse(await readBoundedJson(request));
    const candidate = parsed.success ? parsed.data.password : "";
    if (!parsed.success || !verifyPassword(candidate, configuredPassword)) {
      const afterFailure = recordLoginFailure(key);
      const response = errorResponse(
        afterFailure.allowed ? "Invalid password" : "Too many sign-in attempts",
        afterFailure.allowed ? 401 : 429,
      );
      if (!afterFailure.allowed) {
        response.headers.set("retry-after", String(afterFailure.retryAfterSeconds));
      }
      return response;
    }

    clearLoginThrottle(key);
    const token = await createSessionToken(sessionSecret);
    const response = noStore(new NextResponse(null, { status: 204 }));
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS / 1_000,
    });
    return response;
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return errorResponse(error.message, error.status);
    }
    return errorResponse("Sign-in request could not be processed", 400);
  }
}
