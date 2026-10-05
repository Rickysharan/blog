import { NextResponse } from "next/server";

import { parseStudioOriginEnv } from "../../../lib/env";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type StudioOriginConfig = {
  studioOrigin: string;
  allowedOrigins: readonly string[];
};

function readOriginConfig(): StudioOriginConfig | null {
  try {
    const parsed = parseStudioOriginEnv({
      NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL,
      AUTH_ALLOWED_ORIGINS: process.env.AUTH_ALLOWED_ORIGINS
    });
    return {
      studioOrigin: new URL(parsed.NEXT_PUBLIC_STUDIO_URL).origin,
      allowedOrigins: parsed.AUTH_ALLOWED_ORIGINS.split(",").map((origin) => new URL(origin.trim()).origin)
    };
  } catch {
    return null;
  }
}

function safeNext(value: string | null, studioOrigin: string): string {
  if (!value || value.length > 1_024 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/overview";
  }
  try {
    const destination = new URL(value, studioOrigin);
    if (destination.origin !== studioOrigin) return "/overview";
    return `${destination.pathname}${destination.search}`;
  } catch {
    return "/overview";
  }
}

function noStoreRedirect(destination: URL): NextResponse {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function loginRedirect(config: StudioOriginConfig | null): NextResponse {
  const origin = config?.studioOrigin ?? "https://invalid.local";
  const destination = new URL("/login", origin);
  destination.searchParams.set("error", "invalid_callback");
  return noStoreRedirect(destination);
}

export async function GET(request: Request) {
  const config = readOriginConfig();
  if (!config) return loginRedirect(config);

  const requestUrl = new URL(request.url);
  if (!config.allowedOrigins.includes(requestUrl.origin)) return loginRedirect(config);

  const code = requestUrl.searchParams.get("code");
  if (!code || code.length > 2_048) return loginRedirect(config);

  try {
    const { error } = await (await createServerSupabaseClient()).auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Studio OAuth code exchange failed", {
        name: error.name,
        code: "code" in error ? error.code : undefined,
        status: "status" in error ? error.status : undefined
      });
      return loginRedirect(config);
    }
  } catch (error) {
    console.error("Studio OAuth callback failed", {
      name: error instanceof Error ? error.name : "UnknownError"
    });
    return loginRedirect(config);
  }

  const destination = new URL(safeNext(requestUrl.searchParams.get("next"), requestUrl.origin), requestUrl.origin);
  return noStoreRedirect(destination);
}
