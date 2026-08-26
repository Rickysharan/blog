import { NextResponse } from "next/server";

import { assertSameOrigin, RequestGuardError } from "@/lib/auth/request";
import { ADMIN_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("cache-control", "no-store");
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const status = error instanceof RequestGuardError ? error.status : 400;
    return NextResponse.json(
      { error: "Logout request could not be processed" },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
