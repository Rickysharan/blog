import { parseStudioOriginEnv } from "../../../../lib/env";

export const dynamic = "force-dynamic";

function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function readOrigins(): { studio: string; allowed: readonly string[] } | null {
  try {
    const parsed = parseStudioOriginEnv({
      NEXT_PUBLIC_STUDIO_URL: process.env.NEXT_PUBLIC_STUDIO_URL,
      AUTH_ALLOWED_ORIGINS: process.env.AUTH_ALLOWED_ORIGINS
    });
    return {
      studio: new URL(parsed.NEXT_PUBLIC_STUDIO_URL).origin,
      allowed: parsed.AUTH_ALLOWED_ORIGINS.split(",").map((value) => new URL(value.trim()).origin)
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const origins = readOrigins();
  const requestURL = new URL(request.url);
  const fallback = new URL("/login?error=invalid_callback", origins?.studio ?? "https://invalid.local").toString();
  if (!origins || !origins.allowed.includes(requestURL.origin)) return redirect(fallback);
  const codes = requestURL.searchParams.getAll("code");
  if (requestURL.searchParams.size !== 1 || codes.length !== 1 || !codes[0] || codes[0].length > 2_048) {
    return redirect(fallback);
  }
  const callback = new URL("com.rickysharan.omnilede://auth-callback");
  callback.searchParams.set("code", codes[0]);
  return redirect(callback.toString());
}
