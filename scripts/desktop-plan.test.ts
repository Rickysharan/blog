import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
const script = path.join(process.cwd(), "scripts/desktop-plan.ts");

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function roots(): Promise<{ contentRoot: string; auditRoot: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "omnilede-plan-command-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const contentRoot = path.join(root, "content");
  const auditRoot = path.join(root, ".audit");
  await mkdir(contentRoot, { recursive: true });
  return { contentRoot, auditRoot };
}

async function command(
  args: string[],
  options: { env?: Record<string, string>; roots?: { contentRoot: string; auditRoot: string } } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const paths = options.roots ?? await roots();
  try {
    const result = await execFileAsync(process.execPath, [
      "--conditions=react-server",
      "--import",
      "tsx",
      script,
      ...args,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...options.env,
        OMNILEDE_CONTENT_ROOT: paths.contentRoot,
        OMNILEDE_AUDIT_ROOT: paths.auditRoot,
      },
      timeout: 10_000,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failure.code ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

function planEvent(stdout: string) {
  const line = stdout.trim();
  expect(line.startsWith("@omnilede-plan ")).toBe(true);
  return JSON.parse(line.slice("@omnilede-plan ".length));
}

describe("desktop plan command protocol", () => {
  it("prints one snapshot event with a stable three-category plan", async () => {
    const paths = await roots();
    const first = await command(["--action", "snapshot", "--date", "2026-10-02"], { roots: paths });
    const second = await command(["--action", "snapshot", "--date", "2026-10-02"], { roots: paths });

    expect(first).toMatchObject({ code: 0, stderr: "" });
    expect(planEvent(first.stdout)).toMatchObject({
      date: "2026-10-02",
      completedCount: 0,
      totalTasks: 3,
      tasks: [
        { category: "anime", status: "todo" },
        { category: "movies", status: "todo" },
        { category: "politics", status: "todo" },
      ],
    });
    expect(second.stdout).toBe(first.stdout);
  });

  it("prints the replacement snapshot for a valid todo category", async () => {
    const paths = await roots();
    await command(["--action", "snapshot", "--date", "2026-10-02"], { roots: paths });

    const result = await command([
      "--action", "replace",
      "--category", "anime",
      "--date", "2026-10-02",
    ], { roots: paths });

    expect(result.code).toBe(0);
    expect(planEvent(result.stdout).tasks.map((task: { category: string }) => task.category)).toEqual([
      "sports", "movies", "politics",
    ]);
  });

  it.each([
    { args: ["--action", "erase"], message: "--action must be snapshot or replace" },
    { args: ["--action", "replace", "--category", "local-news"], message: "--category must be one of" },
    { args: ["--action", "snapshot", "--date", "tomorrow"], message: "--date must use YYYY-MM-DD" },
  ])("rejects invalid planner input: $message", async ({ args, message }) => {
    const result = await command(args);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("@omnilede-plan-error ");
    expect(result.stdout).toContain(message);
  });

  it("sanitizes internal errors without exposing credentials", async () => {
    const secret = "github_pat_secretvalue123456";
    const result = await command(["--action", "snapshot", "--date", "2026-10-02"], {
      env: {
        LOCAL_WRITER_SYNC: "true",
        GITHUB_REPOSITORY: `invalid-${secret}`,
        GITHUB_BRANCH: "main",
        GITHUB_TOKEN: secret,
      },
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Daily plan could not be refreshed");
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).toBe("");
  });
});
