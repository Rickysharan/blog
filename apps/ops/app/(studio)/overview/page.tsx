import Link from "next/link";

import { SourceCard } from "../../../components/overview/source-card";
import { requireStudioOperator } from "../../../lib/auth/operator";
import { loadStudioEditorialInventory } from "../../../lib/editorial/repository";
import { listPublicationHistory } from "../../../lib/publication/history";
import { fetchGa4Report } from "../../../lib/providers/ga4";
import { fetchSearchReport } from "../../../lib/providers/search-console";
import { listTodayTasks } from "../../../lib/tasks/repository";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  await requireStudioOperator();
  let data: Awaited<ReturnType<typeof loadStudioEditorialInventory>> | undefined;
  let tasks: Awaited<ReturnType<typeof listTodayTasks>> | undefined;
  let history: Awaited<ReturnType<typeof listPublicationHistory>> | undefined;
  const [analytics, search] = await Promise.all([
    fetchGa4Report("28d").catch(() => undefined),
    fetchSearchReport("28d").catch(() => undefined)
  ]);
  try {
    [data, tasks, history] = await Promise.all([
      loadStudioEditorialInventory(), listTodayTasks(), listPublicationHistory()
    ]);
  } catch {
    // Render a truthful unavailable state below.
  }
  if (!data || !tasks || !history) return <div className="studio-page"><h1>Overview</h1><div className="studio-empty-state" role="alert"><p>Overview is temporarily unavailable.</p><span>No source value has been replaced with a guessed zero. Check Studio connections and reload.</span></div></div>;
  const published = data.items.filter(({ kind }) => kind === "published").length;
  const drafts = data.items.filter(({ kind }) => kind === "draft").length;
  const openTasks = tasks.filter(({ state }) => state === "open").length;
  const latestPublication = history.find(({ action }) => action === "publish")?.created_at ?? null;
  return (
    <div className="studio-page">
      <p className="eyebrow">Verified newsroom status</p><h1>Overview</h1>
      <p className="studio-page-intro">Repository facts are live. Audience, search, and revenue remain unavailable until their read-only sources are connected.</p>
      <div className="source-grid">
        <SourceCard label="Published articles" value={published} state="available" source={`GitHub content · ${data.version?.slice(0, 8) ?? "version unavailable"}`} refreshedAt={null} />
        <SourceCard label="Waiting drafts" value={drafts} state="available" source="GitHub content" refreshedAt={null} />
        <SourceCard label="Open Today tasks" value={openTasks} state="available" source="Studio tasks" refreshedAt={null} />
        <SourceCard label="Latest publication" value={latestPublication ? new Date(latestPublication).toLocaleDateString() : "No recorded publication"} state="available" source="Publication history" refreshedAt={latestPublication} />
        <SourceCard label="Active users" value={analytics?.data?.summary.activeUsers ?? null} state={analytics?.state ?? "unavailable"} source={analytics?.source ?? "Google Analytics"} refreshedAt={analytics?.fetchedAt ?? null} />
        <SourceCard label="Search clicks" value={search?.data?.summary?.clicks ?? null} state={search?.state ?? "unavailable"} source={search?.source ?? "Google Search Console"} refreshedAt={search?.fetchedAt ?? null} />
        <SourceCard label="AdSense earnings" value={null} state="disconnected" source="Google AdSense" refreshedAt={null} />
      </div>
      <div className="overview-links"><Link href="/today">Open today’s work</Link><Link href="/health">Review site health</Link></div>
    </div>
  );
}
