import { CategoryTable } from "../../../components/categories/category-table";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { buildCategorySummaries } from "../../../lib/editorial/category-summary";
import { loadStudioEditorialInventory } from "../../../lib/editorial/repository";
import { listTodayTasks } from "../../../lib/tasks/repository";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireStudioOperator();
  let summaries: ReturnType<typeof buildCategorySummaries> | undefined;
  try {
    const [inventory, tasks] = await Promise.all([loadStudioEditorialInventory(), listTodayTasks()]);
    summaries = buildCategorySummaries(inventory, { tasks });
  } catch {
    // Render a truthful unavailable state below.
  }
  if (!summaries) return <div className="studio-page"><h1>Categories</h1><div className="studio-empty-state" role="alert"><p>Category inventory is temporarily unavailable.</p><span>Counts are hidden because the versioned GitHub source could not be verified.</span></div></div>;
  return <div className="studio-page"><p className="eyebrow">All desks</p><h1>Categories</h1><p className="studio-page-intro">Every category desk remains visible, including desks with no content yet.</p><CategoryTable summaries={summaries} /></div>;
}
