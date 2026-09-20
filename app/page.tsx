import { AdSlot } from "@/components/ads/ad-slot";
import { LeadStory } from "@/components/articles/lead-story";
import { MarketStrip } from "@/components/market/market-strip";
import { RegionalFeed } from "@/components/region/regional-feed";
import { CATEGORIES } from "@/lib/config/categories";
import { commercialFeaturesEnabled } from "@/lib/config/commercial";
import { getAllArticles } from "@/lib/content/articles";
import { selectHomepageStories } from "@/lib/content/homepage";
import { fetchMarketSnapshot } from "@/lib/market/provider";

export default async function HomePage() {
  const commercialEnabled = commercialFeaturesEnabled();
  const [articles, marketSnapshot] = await Promise.all([
    getAllArticles(),
    fetchMarketSnapshot({ apiKey: process.env.STOCK_API_KEY }),
  ]);
  const { lead, categoryStories, latest } = selectHomepageStories(
    articles,
    articles.length,
  );
  const deskStories = CATEGORIES.map(
    (category) =>
      latest.find((article) => article.category === category.slug) ??
      categoryStories[category.slug],
  ).filter((article) => article !== null);

  return (
    <main id="main-content">
      <MarketStrip snapshot={marketSnapshot} />
      <div className="mx-auto max-w-[1480px] px-4 py-4 sm:px-6 sm:py-6">
        {lead ? (
          <LeadStory
            article={lead}
            deskArticles={deskStories.slice(0, 4)}
            supportingArticles={latest.slice(0, 5)}
          />
        ) : (
          <section className="border-y border-line py-20 text-center">
            <h1 className="font-serif text-5xl font-semibold tracking-[-0.05em]">
              The next edition is being prepared.
            </h1>
            <p className="mt-4 text-muted">
              Reviewed stories appear here after editorial approval.
            </p>
          </section>
        )}
        {commercialEnabled ? (
          <div className="mt-14">
            <AdSlot
              adsenseClientId={process.env.ADSENSE_CLIENT_ID}
              adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
              commercialEnabled={commercialEnabled}
              slotId={process.env.ADSENSE_SLOT_IN_FEED}
              variant="article"
            />
          </div>
        ) : null}

        {latest.slice(5).length > 0 ? (
          <div className="mt-20">
            <RegionalFeed articles={latest.slice(5)} heading="Latest reporting" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
