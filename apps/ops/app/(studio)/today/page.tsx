import { TaskList } from "../../../components/today/task-list";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { listTodayTasks } from "../../../lib/tasks/repository";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireStudioOperator();
  let tasks: Awaited<ReturnType<typeof listTodayTasks>> | undefined;
  try {
    tasks = await listTodayTasks();
  } catch {
    // Render a truthful unavailable state below.
  }
  if (!tasks) return <div className="studio-page"><h1>Today</h1><div className="studio-empty-state" role="alert"><p>Today’s list is temporarily unavailable.</p><span>Your saved tasks remain in Studio. Reload after checking the database connection.</span></div></div>;
  return <div className="studio-page"><p className="eyebrow">Daily work</p><h1>Today</h1><p className="studio-page-intro">Review, writing, SEO, setup, and maintenance actions derived from current evidence.</p><TaskList initialTasks={tasks} /></div>;
}
