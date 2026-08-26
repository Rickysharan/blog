import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1_000;
const BLOCK_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;
const MAX_KEYS = 5_000;

interface ThrottleEntry {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
}

interface ThrottleOptions {
  now?: number;
}

export interface ThrottleResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const attempts = new Map<string, ThrottleEntry>();

function now(options: ThrottleOptions): number {
  return options.now ?? Date.now();
}

function prune(currentTime: number): void {
  for (const [key, entry] of attempts) {
    if (
      currentTime >= entry.blockedUntil &&
      currentTime - entry.windowStartedAt >= WINDOW_MS
    ) {
      attempts.delete(key);
    }
  }
}

function makeRoom(currentTime: number): void {
  prune(currentTime);
  if (attempts.size < MAX_KEYS) {
    return;
  }
  const oldest = attempts.keys().next().value as string | undefined;
  if (oldest) {
    attempts.delete(oldest);
  }
}

export function hashThrottleKey(value: string, secret: string): string {
  return createHash("sha256").update(secret).update("\0").update(value).digest("hex");
}

export function checkLoginThrottle(
  key: string,
  options: ThrottleOptions = {},
): ThrottleResult {
  const currentTime = now(options);
  const entry = attempts.get(key);
  if (!entry) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.blockedUntil > currentTime) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - currentTime) / 1_000)),
    };
  }
  if (currentTime - entry.windowStartedAt >= WINDOW_MS) {
    attempts.delete(key);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(
  key: string,
  options: ThrottleOptions = {},
): ThrottleResult {
  const currentTime = now(options);
  const previous = attempts.get(key);
  const entry =
    previous && currentTime - previous.windowStartedAt < WINDOW_MS
      ? previous
      : { failures: 0, windowStartedAt: currentTime, blockedUntil: 0 };

  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = currentTime + BLOCK_MS;
  }
  if (!previous) {
    makeRoom(currentTime);
  }
  attempts.set(key, entry);
  return checkLoginThrottle(key, { now: currentTime });
}

export function clearLoginThrottle(key?: string): void {
  if (key) {
    attempts.delete(key);
  } else {
    attempts.clear();
  }
}
