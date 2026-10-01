import { parseArgs } from "node:util";
import { runLocalWriter } from "@/lib/pipeline/local-run";

const { values } = parseArgs({
  options: {
    limit: { type: "string", default: "1" },
    sync: { type: "boolean", default: false },
    "queue-only": { type: "boolean", default: false },
    "sync-only": { type: "boolean", default: false },
    "local-only": { type: "boolean", default: false },
  },
});

const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
  console.error("--limit must be an integer from 1 to 10.");
  process.exitCode = 1;
} else if (values["local-only"] && (values.sync || values["sync-only"])) {
  console.error("Choose --local-only or --sync/--sync-only, not both.");
  process.exitCode = 1;
} else {
  const result = await runLocalWriter({
    limit,
    sync: values.sync,
    queueOnly: values["queue-only"],
    syncOnly: values["sync-only"],
    localOnly: values["local-only"],
    onEvent(event) {
      console.log(`@omnilede ${JSON.stringify(event)}`);
    },
  });

  console.log(result.message);
  if (result.status !== "completed") process.exitCode = 1;
}
