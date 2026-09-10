import { NextResponse } from "next/server";

import { AuthInputError } from "./input";
import { isAllowedOrigin } from "./safe-next";

export function jsonAuthResponse(body: Record<string, unknown>, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Origin");
  return response;
}

export function rejectOrigin(request: Request): NextResponse | null {
  return isAllowedOrigin(request) ? null : jsonAuthResponse({ error: "Invalid request origin" }, 403);
}

export function inputErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthInputError) return jsonAuthResponse({ error: error.message }, error.status);
  return jsonAuthResponse({ error: "Invalid authentication input" }, 400);
}

export function unavailableResponse(): NextResponse {
  return jsonAuthResponse({ error: "Authentication is temporarily unavailable" }, 503);
}

export function rateLimitedResponse(): NextResponse {
  const response = jsonAuthResponse({ error: "Too many attempts. Try again later." }, 429);
  response.headers.set("Retry-After", "3600");
  return response;
}
