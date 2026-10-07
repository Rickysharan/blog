export const RICKY_SHARAN_PROFILE = Object.freeze({
  name: "Ricky Sharan",
  slug: "ricky-sharan",
  path: "/author/ricky-sharan",
  role: "Editor and publisher of OmniLede",
  disclosure: "Local AI tools may assist with private drafts. Ricky reviews each article and decides whether to publish it.",
});

const AUTHOR_PROFILES = Object.freeze([RICKY_SHARAN_PROFILE]);

export type AuthorProfile = (typeof AUTHOR_PROFILES)[number];

export function getAuthorProfile(name: string): AuthorProfile | undefined {
  return AUTHOR_PROFILES.find((profile) => profile.name === name);
}

export function getAuthorProfileBySlug(slug: string): AuthorProfile | undefined {
  return AUTHOR_PROFILES.find((profile) => profile.slug === slug);
}

export function getAuthorProfiles(): readonly AuthorProfile[] {
  return AUTHOR_PROFILES;
}
