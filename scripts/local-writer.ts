import { promises as fs } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { GitHubDraftRepository } from "@/lib/drafts/github-repository";
import { LocalDraftRepository } from "@/lib/drafts/local-repository";
import { fetchTrendingStories, writeTrendingQueue } from "@/lib/pipeline/fetch";
import { generateDrafts } from "@/lib/pipeline/generate";
import { resolveLocalGitHubTarget } from "@/lib/pipeline/local-github";
import { syncDrafts } from "@/lib/pipeline/sync";
import type { QueueStory } from "@/lib/pipeline/types";

const { values } = parseArgs({ options: {
  limit: { type: "string", default: "1" },
  sync: { type: "boolean", default: false },
  "queue-only": { type: "boolean", default: false },
  "sync-only": { type: "boolean", default: false },
  "local-only": { type: "boolean", default: false },
} });
const contentRoot = path.join(process.cwd(), "content");
const lock = path.join(process.cwd(), ".audit", "local-writer.lock");
let locked = false;
let createdCount = 0;
let uploadedCount = 0;
const progress = (phase: string, message: string, percent: number) => console.log("@omnilede " + JSON.stringify({ phase, message, percent }));
progress("starting", "Starting your local writer…", 5);
try {
  if (process.env.NODE_ENV === "production" || process.env.CI === "true") {
    throw new Error("Run this worker locally, not in production or CI.");
  }
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("--limit must be an integer from 1 to 10.");
  let target: GitHubDraftRepository | undefined;
  if (values["local-only"] && (values.sync || values["sync-only"])) {
    throw new Error("Choose --local-only or --sync/--sync-only, not both.");
  }
  const syncEnabled = values.sync || values["sync-only"] ||
    (process.env.LOCAL_WRITER_SYNC === "true" && !values["local-only"]);
  if (syncEnabled) {
    const { repository, branch, token } = await resolveLocalGitHubTarget(process.env);
    target = new GitHubDraftRepository({ repository, branch, token });
    console.log(`Draft upload target: ${repository}, branch ${branch}. Publishing is never automatic.`);
  }
  await fs.mkdir(path.dirname(lock), { recursive: true });
  await fs.mkdir(lock);
  locked = true;
  if (!values["sync-only"]) {
    const model = process.env.OLLAMA_MODEL?.trim();
    if (!model || /cloud/i.test(model)) throw new Error("Set OLLAMA_MODEL to an installed local model, such as qwen2.5:7b.");
    const tags = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!tags.ok) throw new Error("Ollama is not ready. Start it with OLLAMA_NO_CLOUD=1 ollama serve.");
    const installed = await tags.json() as { models?: Array<{ name: string }> };
    if (!installed.models?.some(item => item.name === model || item.name === `${model}:latest`)) {
      throw new Error(`Model is not installed. Run: ollama pull ${model}`);
    }
    if (!values["queue-only"]) {
      const queuePath = path.join(contentRoot, "queue/trending.json");
      let pending: QueueStory[] = [];
      try { pending = JSON.parse(await fs.readFile(queuePath, "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!Array.isArray(pending)) throw new Error("Existing story queue must be an array.");
      progress("finding", "Finding recent news…", 15);
      const fetched = await fetchTrendingStories({ contentRoot });
      for (const item of fetched.summaries) console.log(`${item.source}: ${item.status} (${item.itemCount} stories)`);
      if (!fetched.successCount) throw new Error("No feeds succeeded; the existing queue is unchanged. Use --queue-only to process saved stories.");
      const written = await writeTrendingQueue([...pending, ...fetched.stories], { contentRoot });
      console.log(`${written.written} source stories queued. RSS recency is a discovery signal, not a measured popularity ranking.`);
    }
    progress("writing", "Writing your article on this Mac…", 30);
    console.log(`Writing up to ${limit} drafts locally with ${model}…`);
    const result = await generateDrafts({
      contentRoot, maxDrafts: limit,
      env: { ...process.env, NODE_ENV: "development", DRAFT_GENERATION_ENABLED: "true", DRAFT_GENERATION_PROVIDER: "ollama" },
    });
    createdCount = result.created.length;
    console.log(`${result.created.length} drafts created; ${result.remaining} stories remain queued.`);
    for (const item of result.failed) console.error(`Draft failed: ${item.title}: ${item.error}`);
    if (result.failed.length) process.exitCode = 1;
  }
  if (target) {
    progress("uploading", "Sending drafts to your dashboard…", 90);
    const result = await syncDrafts(new LocalDraftRepository({ contentRoot }), target);
    uploadedCount = result.created.length;
    console.log(`Dashboard handoff: ${result.created.length} uploaded, ${result.unchanged.length} already present, ${result.failed.length} conflicts/errors.`);
    for (const item of result.failed) console.error(`${item.ref.category}/${item.ref.filename}: ${item.code}`);
    if (result.failed.length) process.exitCode = 1;
  }
  if (!process.exitCode) progress("done", target
    ? (uploadedCount ? `${uploadedCount} draft${uploadedCount === 1 ? "" : "s"} delivered. Review and click Publish in the dashboard.` : "No new uploads. Existing drafts are already in your dashboard.")
    : `${createdCount} draft${createdCount === 1 ? "" : "s"} saved locally. Review before publishing.`, 100);
  console.log("Review drafts at /admin/review. Only your Publish action puts them on the public website.");
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  console.error(code === "EEXIST"
    ? "Another local writer is running. If a previous run crashed, remove .audit/local-writer.lock after confirming it has stopped."
    : error instanceof Error ? error.message : "Local drafting failed.");
  process.exitCode = 1;
} finally {
  if (locked) await fs.rmdir(lock);
}
