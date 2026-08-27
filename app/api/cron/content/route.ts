import { NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/password";
import { runContentPipeline } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status: number): NextResponse {
  const response = NextResponse.json({ ok: false, error: message }, { status });
  response.headers.set("cache-control", "no-store");
  return response;
}

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return false;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 && verifyPassword(token, secret);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return jsonError("Cron endpoint is not configured", 503);
  }
  if (!isAuthorized(request, secret)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const result = await runContentPipeline({ mode: "vercel", maxDrafts: 3 });
    const response = NextResponse.json({
      ok: true,
      status: result.status,
      fetched: result.fetched,
      generated: result.generated,
      skipped: result.skipped,
      failed: result.failed,
      queueRemaining: result.queueRemaining,
      activeFeeds: result.activeFeeds,
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    console.error("Content cron run failed", error instanceof Error ? error.message : String(error));
    return jsonError("Content pipeline failed", 500);
  }
}
