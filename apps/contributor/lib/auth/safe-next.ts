const DEFAULT_NEXT = "/dashboard";

export function allowedOrigins(): readonly string[] {
  return (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  const configured = allowedOrigins();
  if (configured.length > 0) return configured.includes(normalizedOrigin);
  return normalizedOrigin === new URL(request.url).origin;
}

export function safeNext(value: string | null | undefined, request: Request): string {
  if (!value) return DEFAULT_NEXT;
  if (value.length > 1024 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_NEXT;
  }

  try {
    const parsed = new URL(value, request.url);
    if (parsed.origin !== new URL(request.url).origin) return DEFAULT_NEXT;
    return `${parsed.pathname}${parsed.search}` || DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}

export { DEFAULT_NEXT };
