import { generateDrafts } from "@/lib/pipeline/generate";

try {
  const result = await generateDrafts();
  if (result.status === "disabled") {
    console.log(
      "Draft generation is disabled. Set DRAFT_GENERATION_ENABLED=true and configure Anthropic credentials to enable it.",
    );
  } else {
    console.log(
      `Draft generation complete: ${result.created.length} created, ${result.skipped.length} skipped, ${result.failed.length} failed.`,
    );
    for (const failure of result.failed) {
      console.error(`[FAILED] ${failure.sourceUrl} — ${failure.error}`);
    }
    if (result.failed.length > 0) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Draft generation could not start: ${message}`);
  process.exitCode = 1;
}
