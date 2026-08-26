import path from "node:path";

import {
  fetchTrendingStories,
  writeTrendingQueue,
} from "@/lib/pipeline/fetch";

const contentRoot = path.join(process.cwd(), "content");
const result = await fetchTrendingStories({ contentRoot });

for (const summary of result.summaries) {
  const detail = summary.error ? ` — ${summary.error}` : "";
  console.log(
    `[${summary.status.toLocaleUpperCase()}] ${summary.source}: ${summary.itemCount} stories${detail}`,
  );
}

if (result.successCount === 0) {
  console.error("No active RSS source succeeded; the existing queue was left unchanged.");
  process.exitCode = 1;
} else {
  const written = await writeTrendingQueue(result.stories, { contentRoot });
  console.log(
    `Queue updated: ${written.written} stories written, ${written.skippedExisting} existing stories skipped (${written.queuePath}).`,
  );
}
