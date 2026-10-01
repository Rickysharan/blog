import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function readGitHubCliToken(): Promise<string> {
  const { stdout } = await execFileAsync("gh", ["auth", "token", "--hostname", "github.com"], {
    timeout: 10_000,
    maxBuffer: 16 * 1024,
  });
  return stdout;
}

/** Credentials stay in memory; this function never writes or logs them. */
export async function resolveLocalGitHubTarget(
  env: Record<string, string | undefined>,
  readToken: () => Promise<string> = readGitHubCliToken,
): Promise<{ repository: string; branch: string; token: string }> {
  const repository = env.GITHUB_REPOSITORY?.trim();
  const branch = env.GITHUB_BRANCH?.trim();
  if (!repository || !branch) {
    throw new Error("Set the dashboard repository and branch using GITHUB_REPOSITORY and GITHUB_BRANCH.");
  }
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must name a GitHub repository as owner/name.");
  }
  let token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    try { token = (await readToken()).trim(); }
    catch { throw new Error("Sign in with gh auth login, or configure GITHUB_TOKEN locally."); }
  }
  if (!token) throw new Error("Sign in with gh auth login, or configure GITHUB_TOKEN locally.");
  return { repository, branch, token };
}
