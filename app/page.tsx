import { CategorySection } from "@/components/articles/category-section";
import { LeadStory } from "@/components/articles/lead-story";
import { MarketStrip } from "@/components/market/market-strip";
import { AdSlot } from "@/components/ads/ad-slot";
import { RegionalFeed } from "@/components/region/regional-feed";
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
  const cultureCategories = CATEGORIES.filter(({ slug }) =>
    ["anime", "movies", "sports"].includes(slug),
  );
  const powerCategories = CATEGORIES.filter(({ slug }) =>
    ["politics", "finance", "share-market"].includes(slug),
  );

  return (
    <main id="main-content">
      <div className="border-b-2 border-ink bg-panel py-4">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <AdSlot
            adsenseClientId={process.env.ADSENSE_CLIENT_ID}
            adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
            slotId={process.env.ADSENSE_SLOT_HEADER}
            variant="header"
          />
        </div>
      </div>
      <MarketStrip snapshot={marketSnapshot} />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <section aria-labelledby="newsroom-heading" className="retro-hero grid gap-7 overflow-hidden px-5 pb-7 pt-10 sm:px-8 sm:pb-9 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.5fr)] lg:items-end">
          <div>
            <p className="inline-flex bg-cobalt px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-white">
              Today&apos;s global briefing
            </p>
            <h1
              id="newsroom-heading"
              className="mt-5 max-w-5xl font-serif text-4xl font-semibold leading-[0.94] tracking-[-0.055em] sm:text-6xl lg:text-7xl"
            >
              Culture. Power. <span className="text-signal">Capital.</span>
            </h1>
          </div>
          <div className="border-l-[6px] border-cobalt bg-canvas/80 p-5">
            <p className="text-sm font-medium leading-6 text-ink sm:text-base sm:leading-7">
              Fast global headlines, original context and visible sourcing—edited for readers who need the signal, not the noise.
            </p>
            <p className="mt-4 text-[0.65rem] font-black uppercase tracking-[0.16em] text-ink">
              Source-led · Human-reviewed · Global
            </p>
          </div>
        </section>

        <div className="mt-8">
          {lead ? (
            <LeadStory article={lead} supportingArticles={latest.slice(0, 4)} />
          ) : (
            <p className="border-y border-line py-12 text-muted">
              No published stories are available yet.
            </p>
          )}
        </div>

        <section aria-labelledby="culture-heading" className="mt-16">
          <div className="grid gap-4 border-b-[3px] border-ink pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Culture and competition</p>
              <h2 id="culture-heading" className="retro-rule-title mt-2 font-serif text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Audiences in motion
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted sm:text-right">
              Release calendars, creative industries and the events audiences follow worldwide.
            </p>
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {cultureCategories.map((category) => (
              <div className="retro-desk" key={category.slug}>
                <CategorySection
                  category={category.slug}
                  article={categoryStories[category.slug]}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16">
          <AdSlot
            adsenseClientId={process.env.ADSENSE_CLIENT_ID}
            adsenseEnabled={process.env.ADSENSE_ENABLED === "true"}
            slotId={process.env.ADSENSE_SLOT_IN_FEED}
            variant="article"
          />
        </div>

        <section aria-labelledby="power-heading" className="mt-16">
          <div className="grid gap-4 border-b-[3px] border-ink pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted">Institutions and markets</p>
              <h2 id="power-heading" className="retro-rule-title mt-2 font-serif text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Power, policy and capital
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted sm:text-right">
              Politics, companies, economies and market moves placed in their global context.
            </p>
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {powerCategories.map((category) => (
              <div className="retro-desk" key={category.slug}>
                <CategorySection
                  category={category.slug}
                  article={categoryStories[category.slug]}
                />
              </div>
            ))}
          </div>
        </section>

        {latest.slice(4).length > 0 ? (
          <div className="mt-20">
            <RegionalFeed articles={latest.slice(4)} heading="Latest reporting" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
