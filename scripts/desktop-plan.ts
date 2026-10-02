import path from "node:path";
import { parseArgs } from "node:util";
import { isCategorySlug } from "@/lib/config/categories";
import {
  getDailyPlanSnapshot,
  replaceDailyPlanTask,
  type PlannerInput,
} from "@/lib/desktop/daily-plan";

class PlannerInputError extends Error {}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function emit(prefix: "@omnilede-plan" | "@omnilede-plan-error", value: unknown): void {
  process.stdout.write(`${prefix} ${JSON.stringify(value)}\n`);
}

try {
  const { values } = parseArgs({
    options: {
      action: { type: "string" },
      category: { type: "string" },
      date: { type: "string" },
    },
  });
  if (values.action !== "snapshot" && values.action !== "replace") {
    throw new PlannerInputError("--action must be snapshot or replace.");
  }
  if (values.date !== undefined && !validDate(values.date)) {
    throw new PlannerInputError("--date must use YYYY-MM-DD and name a real calendar date.");
  }
  const category = values.category && isCategorySlug(values.category) ? values.category : undefined;
  if (values.action === "replace" && !category) {
    throw new PlannerInputError(
      "--category must be one of: anime, movies, politics, sports, finance, share-market.",
    );
  }

  const root = process.cwd();
  const input: PlannerInput = {
    contentRoot: process.env.OMNILEDE_CONTENT_ROOT ?? path.join(root, "content"),
    auditRoot: process.env.OMNILEDE_AUDIT_ROOT ?? path.join(root, ".audit"),
    env: process.env,
    date: values.date,
  };
  const snapshot = values.action === "replace"
    ? await replaceDailyPlanTask({ ...input, category: category! })
    : await getDailyPlanSnapshot(input);
  emit("@omnilede-plan", snapshot);
} catch (error) {
  emit("@omnilede-plan-error", {
    message: error instanceof PlannerInputError
      ? error.message
      : "Daily plan could not be refreshed. Your saved work is unchanged.",
  });
  process.exitCode = 1;
}
