import type { FeedDefinition } from "@/lib/pipeline/types";

/**
 * The unavailable entries intentionally remain in this registry. They are requested
 * publishers whose legacy public RSS endpoints were retired or block unattended
 * clients. Keeping them visible makes source drift observable without scraping HTML
 * or silently attributing a replacement publisher.
 */
export const FEEDS: readonly FeedDefinition[] = [
  {
    id: "anime-news-network",
    source: "Anime News Network",
    category: "anime",
    url: "https://www.animenewsnetwork.com/all/rss.xml?ann-edition=w",
    status: "active",
  },
  {
    id: "crunchyroll-news",
    source: "Crunchyroll News",
    category: "anime",
    url: "https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss",
    status: "active",
  },
  {
    id: "variety-film-news",
    source: "Variety",
    category: "movies",
    url: "https://variety.com/v/film/news/feed/",
    status: "active",
  },
  {
    id: "ign-movies",
    source: "IGN Movies",
    category: "movies",
    url: "https://feeds.feedburner.com/ign/movies-articles",
    status: "active",
  },
  {
    id: "reuters-world",
    source: "Reuters World",
    category: "politics",
    url: "https://feeds.reuters.com/Reuters/worldNews",
    status: "unavailable",
    unavailableReason:
      "Reuters retired the legacy public World RSS host; current Reuters content feeds require a licensed product.",
  },
  {
    id: "al-jazeera",
    source: "Al Jazeera",
    category: "politics",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    status: "active",
  },
  {
    id: "ap-top-news",
    source: "AP News",
    category: "politics",
    url: "https://apnews.com/hub/ap-top-news?output=rss",
    status: "unavailable",
    unavailableReason:
      "AP retired its unauthenticated public headline RSS endpoint; AP Media API feeds require an API key and content entitlement.",
  },
  {
    id: "bbc-sport",
    source: "BBC Sport",
    category: "sports",
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
    status: "active",
  },
  {
    id: "espn",
    source: "ESPN",
    category: "sports",
    url: "https://www.espn.com/espn/rss/news",
    status: "active",
  },
  {
    id: "reuters-business",
    source: "Reuters Business",
    category: "finance",
    url: "https://feeds.reuters.com/reuters/businessNews",
    status: "unavailable",
    unavailableReason:
      "Reuters retired the legacy public Business RSS host; current Reuters content feeds require a licensed product.",
  },
  {
    id: "yahoo-finance",
    source: "Yahoo Finance",
    category: "finance",
    url: "https://finance.yahoo.com/news/rssindex",
    status: "active",
  },
  {
    id: "moneycontrol-markets",
    source: "Moneycontrol",
    category: "share-market",
    url: "https://www.moneycontrol.com/rss/marketreports.xml",
    status: "unavailable",
    unavailableReason:
      "Moneycontrol currently returns HTTP 403 to unattended clients for its public market RSS endpoint.",
  },
  {
    id: "cnbc-markets",
    source: "CNBC Markets",
    category: "share-market",
    url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    status: "active",
  },
];
