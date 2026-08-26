import { NextResponse } from "next/server";

import { requireAdminSession, RequestGuardError } from "@/lib/auth/request";
import { DraftConfigurationError, getDraftRepository } from "@/lib/drafts/repository";
import { DraftRepositoryError } from "@/lib/drafts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseError(error: unknown): NextResponse {
  if (error instanceof RequestGuardError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof DraftConfigurationError) {
    return NextResponse.json(
      { error: "storage_unavailable", message: "Draft storage is not configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof DraftRepositoryError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid_input" ? 400 : 503;
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { error: "internal_error", message: "Drafts could not be loaded." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    await requireAdminSession(request);
    const drafts = await getDraftRepository().list();
    return NextResponse.json(
      { drafts },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
