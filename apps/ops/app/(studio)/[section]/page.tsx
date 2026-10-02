import { notFound } from "next/navigation";

const sections = {
  overview: ["Overview", "Verified newsroom signals will appear here as providers are connected."],
  today: ["Today", "Your editorial and maintenance work will appear here."],
  categories: ["Categories", "Coverage for all six OmniLede categories will appear here."],
  content: ["Content", "Review, save, and publish versioned drafts from this workspace."],
  growth: ["Growth", "Audience trends will appear after Google Analytics is connected."],
  search: ["Google Search", "Search Console reports will appear after a verified connection."],
  revenue: ["Revenue", "AdSense readiness and genuine revenue data will appear here."],
  health: ["Site health", "Deployment, provider, indexing, and publication checks will appear here."]
} as const;

export default async function StudioSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section as keyof typeof sections];
  if (!content) notFound();

  return (
    <section className="studio-page" aria-labelledby="studio-page-title">
      <p className="eyebrow">OmniLede Studio</p>
      <h1 id="studio-page-title">{content[0]}</h1>
      <p className="studio-page-intro">{content[1]}</p>
      <div className="studio-empty-state">
        <p>Source setup is pending.</p>
        <span>No metrics are shown until a verified source returns them.</span>
      </div>
    </section>
  );
}
