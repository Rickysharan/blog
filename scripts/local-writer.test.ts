import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = path.join(process.cwd(), "scripts/local-writer.ts");

async function runWith(args: string[]): Promise<{ code: number; stderr: string }> {
  try {
    await execFileAsync(process.execPath, [
      "--conditions=react-server",
      "--import",
      "tsx",
      script,
      ...args,
    ], {
      cwd: process.cwd(),
      env: { ...process.env, OLLAMA_MODEL: "test-model" },
      timeout: 10_000,
    });
    return { code: 0, stderr: "" };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    return { code: failure.code ?? 1, stderr: failure.stderr ?? "" };
  }
}

describe("local writer command options", () => {
  it("rejects an unsupported category before starting the writer", async () => {
    const result = await runWith(["--category", "local-news"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/--category must be one of/i);
  });

  it("rejects a malformed plan date before starting the writer", async () => {
    const result = await runWith(["--category", "sports", "--plan-date", "tomorrow"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--plan-date must use YYYY-MM-DD");
  });
});
