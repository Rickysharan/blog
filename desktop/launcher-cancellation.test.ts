import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function waitFor(pathname: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { return await readFile(pathname, "utf8"); } catch { /* wait for the child */ }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${pathname}`);
}

it("forwards desktop cancellation to the actual writer process", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "omnilede-launcher-cancel-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const ready = path.join(directory, "ready");
  const stopped = path.join(directory, "stopped");
  const worker = path.join(directory, "worker.sh");
  await writeFile(worker, `#!/bin/bash\ntrap 'echo stopped > "${stopped}"; exit 130' TERM INT\necho ready > "${ready}"\nwhile true; do sleep 1; done\n`, "utf8");
  await chmod(worker, 0o700);

  const launcher = spawn("/bin/bash", ["Start OmniLede.command"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LOCAL_WRITER_SYNC: "true",
      LOCAL_WRITER_REVIEW_URL: "https://example.com/admin/review",
      OMNILEDE_DESKTOP: "true",
      OMNILEDE_WRITER_EXECUTABLE: worker,
    },
    stdio: "ignore",
  });
  await waitFor(ready);
  launcher.kill("SIGTERM");
  await new Promise<void>((resolve, reject) => {
    launcher.once("exit", () => resolve());
    launcher.once("error", reject);
  });
  await expect(waitFor(stopped)).resolves.toContain("stopped");
});
