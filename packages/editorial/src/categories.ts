export const CATEGORIES = [
  {
    slug: "anime",
    label: "Anime",
    accent: "violet",
    description: "Global anime releases and industry news",
  },
  {
    slug: "movies",
    label: "Movies",
    accent: "rose",
    description: "Worldwide cinema, releases, reviews and box office",
  },
  {
    slug: "politics",
    label: "Politics",
    accent: "blue",
    description: "Global politics, policy and analysis",
  },
  {
    slug: "sports",
    label: "Sports",
    accent: "green",
    description: "Major competitions and athletes worldwide",
  },
  {
    slug: "finance",
    label: "Finance",
    accent: "amber",
    description: "Global business, economies and corporate news",
  },
  {
    slug: "share-market",
    label: "Share Market",
    accent: "cyan",
    description: "Indices, equities and major market moves",
  },
] as const;

export type CategoryDefinition = (typeof CATEGORIES)[number];
export type CategorySlug = CategoryDefinition["slug"];
export type CategoryAccent = CategoryDefinition["accent"];

export const CATEGORY_SLUGS = CATEGORIES.map(
  ({ slug }) => slug,
) as CategorySlug[];

export const isCategorySlug = (value: string): value is CategorySlug =>
  CATEGORY_SLUGS.includes(value as CategorySlug);

export const getCategory = (slug: CategorySlug): CategoryDefinition =>
  CATEGORIES.find((category) => category.slug === slug) as CategoryDefinition;
