const FALLBACK_SITE_URL = "http://localhost:3000";

const normalizeSiteUrl = (value: string | undefined): string => {
  try {
    const url = new URL(value || FALLBACK_SITE_URL);
    return url.toString().replace(/\/$/, "");
  } catch {
    return FALLBACK_SITE_URL;
  }
};

export const SITE_CONFIG = {
  name: "OmniLede",
  shortName: "OmniLede",
  description:
    "A global newsroom for anime, movies, politics, sports, finance and share markets.",
  url: normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "en_GB",
  publisher: "OmniLede Editorial",
} as const;
