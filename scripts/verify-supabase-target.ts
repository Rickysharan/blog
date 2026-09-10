export type SupabaseTarget = {
  projectRef: string;
  projectUrl: string;
};

export type TargetVerificationInput = {
  target: SupabaseTarget | null;
  expectedProjectRef?: string;
  confirmedProjectRef?: string;
  knownProjectRefs?: readonly string[];
};

export class TargetVerificationError extends Error {
  override name = "TargetVerificationError";
}

function projectUrlMatchesRef(projectUrl: string, projectRef: string): boolean {
  try {
    const parsed = new URL(projectUrl);
    return parsed.protocol === "https:" && parsed.hostname === `${projectRef}.supabase.co` && parsed.pathname === "/";
  } catch {
    return false;
  }
}

export function verifySupabaseTarget(input: TargetVerificationInput): SupabaseTarget {
  if (!input.target) throw new TargetVerificationError("Supabase target is unknown; no cloud action is permitted");
  const target = input.target;
  if (!target.projectRef || !target.projectUrl) {
    throw new TargetVerificationError("Supabase target is incomplete; no cloud action is permitted");
  }
  if (input.expectedProjectRef !== target.projectRef) {
    throw new TargetVerificationError("Target does not match SUPABASE_PROJECT_REF");
  }
  if (!projectUrlMatchesRef(target.projectUrl, target.projectRef)) {
    throw new TargetVerificationError(`Supabase URL does not match project ref ${target.projectRef}`);
  }

  const knownProjectRefs = new Set(input.knownProjectRefs ?? []);
  if (knownProjectRefs.has(target.projectRef) && input.confirmedProjectRef !== target.projectRef) {
    if (input.confirmedProjectRef) {
      throw new TargetVerificationError("CONFIRMED_SUPABASE_PROJECT_REF must match the target exactly");
    }
    throw new TargetVerificationError("Known existing Supabase project requires explicit confirmation");
  }
  return target;
}

function parseTargetFromEnvironment(environment: NodeJS.ProcessEnv): SupabaseTarget | null {
  const encoded = environment.SUPABASE_TARGET_JSON;
  if (!encoded) return null;
  try {
    const parsed: unknown = JSON.parse(encoded);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.projectRef !== "string" || typeof record.projectUrl !== "string") return null;
    return { projectRef: record.projectRef, projectUrl: record.projectUrl };
  } catch {
    return null;
  }
}

export function verifySupabaseTargetFromEnvironment(environment: NodeJS.ProcessEnv = process.env): SupabaseTarget {
  const knownProjectRefs = (environment.KNOWN_SUPABASE_PROJECT_REFS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return verifySupabaseTarget({
    target: parseTargetFromEnvironment(environment),
    expectedProjectRef: environment.SUPABASE_PROJECT_REF,
    confirmedProjectRef: environment.CONFIRMED_SUPABASE_PROJECT_REF,
    knownProjectRefs
  });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const target = verifySupabaseTargetFromEnvironment();
    console.log(`Supabase target verified: ${target.projectRef}`);
  } catch (error) {
    const message = error instanceof TargetVerificationError ? error.message : "Supabase target verification failed";
    console.error(message);
    process.exitCode = 1;
  }
}
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
