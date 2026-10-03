import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fixtures() {
  const root = await mkdtemp(path.join(tmpdir(), "omnilede-launcher-actions-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const plannerArgs = path.join(root, "planner-args");
  const writerArgs = path.join(root, "writer-args");
  const planner = path.join(root, "planner.sh");
  const writer = path.join(root, "writer.sh");
  await writeFile(planner, `#!/bin/bash\nprintf '%s\\n' "$@" > "${plannerArgs}"\n`, "utf8");
  await writeFile(writer, `#!/bin/bash\nprintf '%s\\n' "$@" > "${writerArgs}"\n`, "utf8");
  await Promise.all([chmod(planner, 0o700), chmod(writer, 0o700)]);
  return { planner, plannerArgs, writer, writerArgs };
}

async function launch(env: Record<string, string>) {
  return execFileAsync("/bin/bash", ["Start OmniLede.command"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
}

describe("desktop launcher actions", () => {
  it("rejects an unsupported category before starting the writer", async () => {
    const fixture = await fixtures();
    await expect(launch({
      OMNILEDE_ACTION: "write",
      OMNILEDE_CATEGORY: "technology",
      OMNILEDE_DESKTOP: "true",
      OMNILEDE_WRITER_EXECUTABLE: fixture.writer,
      LOCAL_WRITER_SYNC: "true",
      LOCAL_WRITER_REVIEW_URL: "https://example.com/admin/review",
    })).rejects.toMatchObject({ code: 64 });
    await expect(readFile(fixture.writerArgs, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("runs only the planner for a snapshot action", async () => {
    const fixture = await fixtures();

    await launch({
      OMNILEDE_ACTION: "plan-snapshot",
      OMNILEDE_PLAN_DATE: "2026-10-02",
      OMNILEDE_PLANNER_EXECUTABLE: fixture.planner,
      OMNILEDE_WRITER_EXECUTABLE: fixture.writer,
    });

    await expect(readFile(fixture.plannerArgs, "utf8")).resolves.toBe("--action\nsnapshot\n--date\n2026-10-02\n");
    await expect(readFile(fixture.writerArgs, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("passes category and date to replacement without starting the writer", async () => {
    const fixture = await fixtures();

    await launch({
      OMNILEDE_ACTION: "plan-replace",
      OMNILEDE_CATEGORY: "anime",
      OMNILEDE_PLAN_DATE: "2026-10-02",
      OMNILEDE_PLANNER_EXECUTABLE: fixture.planner,
      OMNILEDE_WRITER_EXECUTABLE: fixture.writer,
    });

    await expect(readFile(fixture.plannerArgs, "utf8")).resolves.toBe(
      "--action\nreplace\n--category\nanime\n--date\n2026-10-02\n",
    );
    await expect(readFile(fixture.writerArgs, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("passes the selected task to the writer action", async () => {
    const fixture = await fixtures();

    const result = await launch({
      OMNILEDE_ACTION: "write",
      OMNILEDE_CATEGORY: "sports",
      OMNILEDE_PLAN_DATE: "2026-10-02",
      OMNILEDE_START_NEW: "true",
      OMNILEDE_DESKTOP: "true",
      OMNILEDE_WRITER_EXECUTABLE: fixture.writer,
      LOCAL_WRITER_SYNC: "true",
      LOCAL_WRITER_REVIEW_URL: "https://example.com/admin/review",
    });

    await expect(readFile(fixture.writerArgs, "utf8")).resolves.toBe(
      "--limit\n1\n--new\n--category\nsports\n--plan-date\n2026-10-02\n",
    );
    expect(result.stdout).not.toContain("@omnilede {\"phase\":\"dashboard\"");
  });
});
