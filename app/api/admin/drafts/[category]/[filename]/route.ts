import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertSameOrigin,
  readBoundedJson,
  requireAdminSession,
  RequestGuardError,
} from "@/lib/auth/request";
import { DraftConfigurationError, getDraftRepository } from "@/lib/drafts/repository";
import { DraftRepositoryError } from "@/lib/drafts/types";
import { validateDraftRef } from "@/lib/drafts/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const versionSchema = z.string().min(1).max(128).optional();
const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      mdx: z.string().min(1).max(300_000),
      expectedVersion: versionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("publish"),
      mdx: z.string().min(1).max(300_000),
      expectedVersion: versionSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("discard"),
      expectedVersion: versionSchema,
    })
    .strict(),
]);

type RouteContext = {
  params: Promise<{ category: string; filename: string }>;
};

let mutationTail: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationTail.then(operation, operation);
  mutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function responseError(error: unknown): NextResponse {
  if (error instanceof RequestGuardError) {
    const code = error.code === "unauthorized" ? "unauthorized" : "invalid_input";
    return NextResponse.json(
      { error: code, message: error.message },
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
    { error: "internal_error", message: "The draft action could not be completed." },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireAdminSession(request);
    const ref = validateDraftRef(await context.params);
    const draft = await getDraftRepository().read(ref);
    return NextResponse.json(
      { draft },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdminSession(request);
    assertSameOrigin(request);
    const ref = validateDraftRef(await context.params);
    const parsed = mutationSchema.safeParse(
      await readBoundedJson(request, { maxBytes: 300 * 1024 }),
    );
    if (!parsed.success) {
      throw new DraftRepositoryError(
        "invalid_input",
        "Draft action, content, or version is invalid",
      );
    }

    const result = await serializeMutation(async () => {
      const repository = getDraftRepository();
      if (parsed.data.action === "save") {
        return {
          action: "save" as const,
          draft: await repository.save(
            ref,
            parsed.data.mdx,
            parsed.data.expectedVersion,
          ),
        };
      }
      if (parsed.data.action === "publish") {
        return {
          action: "publish" as const,
          published: await repository.publish(
            ref,
            parsed.data.mdx,
            parsed.data.expectedVersion,
          ),
        };
      }
      await repository.discard(ref, parsed.data.expectedVersion);
      return { action: "discard" as const };
    });

    if (result.action === "save") {
      return NextResponse.json(
        { draft: result.draft },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (result.action === "publish") {
      const slug = ref.filename.slice(0, -4);
      revalidatePath("/");
      revalidatePath(`/category/${ref.category}`);
      revalidatePath(`/article/${slug}`);
      return NextResponse.json(result.published, {
        headers: { "cache-control": "no-store" },
      });
    }
    return new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
