import { z } from "zod";

export const AUTH_BODY_LIMIT = 16_384;

const email = z.string().trim().toLowerCase().email().max(320);
const password = z.string().min(12).max(128);

export const signupInputSchema = z.object({ email, password }).strict();
export const loginInputSchema = z.object({ email, password }).strict();
export const forgotPasswordInputSchema = z.object({ email }).strict();
export const resetPasswordInputSchema = z.object({ password }).strict();

export class AuthInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AuthInputError";
  }
}

function textSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function parseInput<T extends z.ZodType>(
  request: Request,
  schema: T,
  invalidMessage = "Invalid request input"
): Promise<z.infer<T>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > AUTH_BODY_LIMIT) {
    throw new AuthInputError("Request body is too large", 413);
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  let payload: unknown;

  if (contentType === "application/json") {
    const text = await request.text();
    if (textSize(text) > AUTH_BODY_LIMIT) throw new AuthInputError("Request body is too large", 413);
    try {
      payload = JSON.parse(text);
    } catch {
      throw new AuthInputError("Invalid request body");
    }
  } else if (contentType === "application/x-www-form-urlencoded" || contentType === "multipart/form-data") {
    const form = await request.formData();
    const values: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string") throw new AuthInputError("Invalid request body");
      values[key] = value;
    }
    if (textSize(JSON.stringify(values)) > AUTH_BODY_LIMIT) throw new AuthInputError("Request body is too large", 413);
    payload = values;
  } else {
    throw new AuthInputError("Content-Type must be application/json or form data", 415);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new AuthInputError(invalidMessage);
  return parsed.data;
}

export async function parseAuthInput<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  return parseInput(request, schema, "Invalid authentication input");
}
