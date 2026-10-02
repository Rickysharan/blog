import path from "node:path";
import { parseArgs } from "node:util";
import { isCategorySlug } from "@/lib/config/categories";
import { recordDailyPlanRun } from "@/lib/desktop/daily-plan";
import { runLocalWriter } from "@/lib/pipeline/local-run";

const { values } = parseArgs({
  options: {
    limit: { type: "string", default: "1" },
    sync: { type: "boolean", default: false },
    "queue-only": { type: "boolean", default: false },
    "sync-only": { type: "boolean", default: false },
    "local-only": { type: "boolean", default: false },
    new: { type: "boolean", default: false },
    category: { type: "string" },
    "plan-date": { type: "string" },
  },
});

const limit = Number(values.limit);
const category = values.category;
const planDate = values["plan-date"];
const validPlanDate = planDate === undefined || (
  /^\d{4}-\d{2}-\d{2}$/.test(planDate) &&
  new Date(`${planDate}T00:00:00.000Z`).toISOString().slice(0, 10) === planDate
);
if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
  console.error("--limit must be an integer from 1 to 10.");
  process.exitCode = 1;
} else if (category !== undefined && !isCategorySlug(category)) {
  console.error("--category must be one of: anime, movies, politics, sports, finance, share-market.");
  process.exitCode = 1;
} else if (!validPlanDate) {
  console.error("--plan-date must use YYYY-MM-DD and name a real calendar date.");
  process.exitCode = 1;
} else if (planDate !== undefined && category === undefined) {
  console.error("--plan-date requires --category.");
  process.exitCode = 1;
} else if (planDate !== undefined && limit !== 1) {
  console.error("A daily-plan task writes one article; use --limit 1.");
  process.exitCode = 1;
} else if (values["local-only"] && (values.sync || values["sync-only"])) {
  console.error("Choose --local-only or --sync/--sync-only, not both.");
  process.exitCode = 1;
} else if (values["sync-only"] && limit > 1) {
  console.error("--sync-only handles one saved draft at a time; use --limit 1.");
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    for (let index = 0; index < limit; index += 1) {
      const result = await runLocalWriter({
        sync: values.sync,
        queueOnly: values["queue-only"],
        syncOnly: values["sync-only"],
        localOnly: values["local-only"],
        newRun: values.new || index > 0,
        category: isCategorySlug(category ?? "") ? category : undefined,
        signal: controller.signal,
        onEvent(event) {
          console.log(`@omnilede ${JSON.stringify(event)}`);
        },
      });

      if (planDate && category && isCategorySlug(category)) {
        await recordDailyPlanRun({
          auditRoot: path.join(process.cwd(), ".audit"),
          date: planDate,
          category,
          result,
        });
      }

      console.log(result.message);
      if (result.status !== "completed") {
        process.exitCode = result.status === "cancelled" ? 130 : 1;
        break;
      }
    }
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
