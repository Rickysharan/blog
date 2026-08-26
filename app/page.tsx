import { CategorySection } from "@/components/articles/category-section";
import { LatestFeed } from "@/components/articles/latest-feed";
import { LeadStory } from "@/components/articles/lead-story";
import { MarketStrip } from "@/components/market/market-strip";
import { CATEGORIES } from "@/lib/config/categories";
import { getAllArticles } from "@/lib/content/articles";
import { selectHomepageStories } from "@/lib/content/homepage";
import { fetchMarketSnapshot } from "@/lib/market/provider";

export default async function HomePage() {
  const [articles, marketSnapshot] = await Promise.all([
    getAllArticles(),
    fetchMarketSnapshot({ apiKey: process.env.STOCK_API_KEY }),
  ]);
  const { lead, categoryStories, latest } = selectHomepageStories(articles);

  return (
    <main id="main-content">
      <MarketStrip snapshot={marketSnapshot} />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <section aria-labelledby="newsroom-heading">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Global briefing · independently reviewed
          </p>
          <h1
            id="newsroom-heading"
            className="mt-2 max-w-5xl font-serif text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl"
          >
            Context for the stories moving audiences, institutions and markets.
          </h1>
        </section>

        <div className="mt-10">
          {lead ? (
            <LeadStory article={lead} />
          ) : (
            <p className="border-y border-line py-12 text-muted">
              No published stories are available yet.
            </p>
          )}
        </div>

        <div className="mt-16 grid gap-x-8 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((category) => (
            <CategorySection
              key={category.slug}
              category={category.slug}
              article={categoryStories[category.slug]}
            />
          ))}
        </div>

        <div className="mt-20">
          <LatestFeed articles={latest} />
        </div>
      </div>
    </main>
  );
}
