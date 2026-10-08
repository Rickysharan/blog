import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
const installTimeout = 90_000;

afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

it.runIf(process.platform === "darwin")(
  "installs a setup-state app without a public-reader fallback when Studio is unconfigured",
  async () => {
    const home = await mkdtemp(path.join(tmpdir(), "omnilede-unconfigured-home-"));
    cleanups.push(() => rm(home, { recursive: true, force: true }));
    await mkdir(path.join(home, "Desktop"), { recursive: true });
    const environment: NodeJS.ProcessEnv = { ...process.env, HOME: home };
    delete environment.OMNILEDE_STUDIO_URL;
    delete environment.NEXT_PUBLIC_STUDIO_URL;
    delete environment.OMNILEDE_SUPABASE_AUTH_URL;
    delete environment.NEXT_PUBLIC_SUPABASE_URL;
    await execFileAsync("python3", ["desktop/install-app.py"], { cwd: process.cwd(), env: environment, timeout: installTimeout });
    const info = await readFile(path.join(home, "Applications/OmniLede.app/Contents/Info.plist"));
    expect(info.toString("utf8")).not.toContain("omnilede-news.netlify.app");
    expect(info.toString("utf8")).not.toContain("OmniLedeStudioURL");
    const launched = await execFileAsync(path.join(home, "Applications/OmniLede.app/Contents/MacOS/OmniLede"), ["--smoke-test"], { timeout: 10_000 });
    expect(launched.stdout).toMatch(/setup state.*no native bridge/i);

    const configuredEnvironment = {
      ...environment,
      OMNILEDE_STUDIO_URL: "https://studio.omnilede-news.netlify.app",
      NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co"
    };
    await execFileAsync("python3", ["desktop/install-app.py"], { cwd: process.cwd(), env: configuredEnvironment, timeout: installTimeout });
    const configuredInfo = await readFile(path.join(home, "Applications/OmniLede.app/Contents/Info.plist"), "utf8");
    expect(configuredInfo).toContain("<key>OmniLedeStudioURL</key>");
    expect(configuredInfo).toContain("https://studio.omnilede-news.netlify.app");
    expect(configuredInfo).toContain("<key>OmniLedeSupabaseAuthURL</key>");
    expect(configuredInfo).toContain("https://project-ref.supabase.co");
    expect(configuredInfo).toContain("<key>CFBundleURLTypes</key>");
    expect(configuredInfo).toContain("com.rickysharan.omnilede");
  },
  installTimeout * 2 + 20_000,
);
